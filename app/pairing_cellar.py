"""Cellar cross-referencing and reverse bottle-to-recipe pairing helpers."""

from __future__ import annotations

import math
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db_models import (
    CellarItemRecord,
    DishRecipeLinkRecord,
    DishRecord,
    RecipeRecord,
    RecipeSensoryProfileRecord,
    TagWineAffinityRecord,
    WineRecord,
)
from app.models import (
    CellarBottleRecipesResponse,
    CellarBottleSummary,
    CellarRecipeMatch,
    WineSuggestionItem,
)

WINE_TYPE_LABELS_ES: dict[str, str] = {
    "Red": "Tinto",
    "White": "Blanco",
    "Sparkling": "Espumoso",
    "Fortified": "Generoso / Fortificado",
    "Rose": "Rosado",
}


class RecipeSignalResolver(Protocol):
    """Protocol for resolving a recipe's dominant wine type and 5D sensory vector."""

    def resolve_recipe_wine_signal(
        self,
        session: Session,
        recipe: RecipeRecord,
        affinity_rows: list[TagWineAffinityRecord] | None = None,
    ) -> tuple[
        str,
        str,
        tuple[float, float, float, float, float] | None,
        list[str],
    ]: ...


def wine_record_to_suggestion(
    wine: WineRecord,
    vinum_base_url: str,
    cellar_entry: CellarItemRecord | None = None,
) -> WineSuggestionItem:
    """Map an enology.wines row (with optional cellar stock) to WineSuggestionItem."""
    base = vinum_base_url.rstrip("/")
    return WineSuggestionItem(
        slug=wine.slug,
        name=wine.name,
        winery=wine.winery,
        appellation=wine.appellation,
        country=wine.country,
        wine_type=wine.wine_type,
        vintage=wine.vintage,
        price_eur=float(wine.price_eur),
        serving_temp_c=float(wine.serving_temp_c),
        decant_minutes=int(wine.decant_minutes or 0),
        glass_type=wine.glass_type,
        tagline=wine.tagline,
        vinum_url=f"{base}/#carte?wine={wine.slug}",
        cellar_quantity=int(cellar_entry.quantity) if cellar_entry is not None else 0,
        cellar_location=cellar_entry.storage_location if cellar_entry is not None else "",
    )


def load_cellar_stock_map(session: Session) -> dict[str, CellarItemRecord]:
    """Return active cellar items keyed by wine_slug (quantity > 0)."""
    rows = session.scalars(select(CellarItemRecord).where(CellarItemRecord.quantity > 0)).all()
    stock: dict[str, CellarItemRecord] = {}
    for row in rows:
        existing = stock.get(row.wine_slug)
        if existing is None or row.quantity > existing.quantity:
            stock[row.wine_slug] = row
    return stock


def find_compatible_cellar_wines(
    session: Session,
    dominant_type: str,
    target_sensory: tuple[float, float, float, float, float] | None,
    vinum_base_url: str,
) -> tuple[int, list[WineSuggestionItem]]:
    """Find bottles in enology.cellar_items matching the recipe's dominant wine type."""
    stmt = (
        select(CellarItemRecord, WineRecord)
        .join(WineRecord, WineRecord.slug == CellarItemRecord.wine_slug)
        .where(CellarItemRecord.quantity > 0, WineRecord.wine_type == dominant_type)
    )
    rows = list(session.execute(stmt).all())
    if not rows:
        return 0, []

    if target_sensory is not None:
        rows.sort(
            key=lambda pair: (
                _sensory_distance(target_sensory, pair[1]),
                float(pair[1].price_eur),
            )
        )
    else:
        rows.sort(key=lambda pair: (-int(pair[0].quantity), float(pair[1].price_eur)))

    total_bottles = sum(int(cellar.quantity) for cellar, _ in rows)
    matches = [
        wine_record_to_suggestion(wine, vinum_base_url, cellar_entry=cellar)
        for cellar, wine in rows[:5]
    ]
    return total_bottles, matches


def list_cellar_bottles(session: Session, vinum_base_url: str) -> list[CellarBottleSummary]:
    """Return all available bottles stored in enology.cellar_items joined with wine metadata."""
    stmt = (
        select(CellarItemRecord, WineRecord)
        .join(WineRecord, WineRecord.slug == CellarItemRecord.wine_slug)
        .where(CellarItemRecord.quantity > 0)
        .order_by(CellarItemRecord.quantity.desc(), WineRecord.name.asc())
    )
    rows = session.execute(stmt).all()
    return [
        CellarBottleSummary(
            wine=wine_record_to_suggestion(wine, vinum_base_url, cellar_entry=cellar),
            quantity=int(cellar.quantity),
            purchase_price_eur=float(cellar.purchase_price_eur),
            storage_location=cellar.storage_location,
            notes=cellar.notes,
        )
        for cellar, wine in rows
    ]


def match_recipes_for_bottle(
    session: Session,
    wine_slug: str,
    vinum_base_url: str,
) -> CellarBottleRecipesResponse | None:
    """Rank main recipes in culinary.recipes compatible with a chosen cellar bottle."""
    row = session.execute(
        select(CellarItemRecord, WineRecord)
        .join(WineRecord, WineRecord.slug == CellarItemRecord.wine_slug)
        .where(CellarItemRecord.wine_slug == wine_slug, CellarItemRecord.quantity > 0)
    ).first()
    if row is None:
        wine_only = session.scalars(select(WineRecord).where(WineRecord.slug == wine_slug)).first()
        if wine_only is None:
            return None
        cellar_entry = CellarItemRecord(
            id=f"virtual-{wine_slug}",
            wine_slug=wine_slug,
            quantity=0,
            storage_location="Catálogo Vinum Pulse",
        )
        wine = wine_only
    else:
        cellar_entry, wine = row[0], row[1]

    recipes = list(
        session.scalars(
            select(RecipeRecord)
            .where(RecipeRecord.is_subrecipe.is_(False))
            .options(selectinload(RecipeRecord.ingredients))
        ).all()
    )
    affinity_rows = list(session.scalars(select(TagWineAffinityRecord)).all())
    scored = [_score_recipe_for_wine(session, recipe, wine, affinity_rows) for recipe in recipes]
    scored.sort(key=lambda item: (-item.compatibility_score, item.recipe_title.lower()))

    bottle = CellarBottleSummary(
        wine=wine_record_to_suggestion(wine, vinum_base_url, cellar_entry=cellar_entry),
        quantity=int(cellar_entry.quantity),
        purchase_price_eur=float(cellar_entry.purchase_price_eur),
        storage_location=cellar_entry.storage_location,
        notes=cellar_entry.notes,
    )
    return CellarBottleRecipesResponse(bottle=bottle, matches=scored[:12])


def _sensory_distance(
    target: tuple[float, float, float, float, float],
    wine: WineRecord,
) -> float:
    """Compute 5D Euclidean sensory distance between a dish/profile and a wine."""
    diffs = (
        target[0] - float(wine.body),
        target[1] - float(wine.acidity),
        target[2] - float(wine.tannins),
        target[3] - float(wine.fruit),
        target[4] - float(wine.oak),
    )
    return math.sqrt(sum(d * d for d in diffs))


def _signal_from_linked_dish(
    session: Session,
    recipe_id: int,
) -> tuple[str, str, tuple[float, float, float, float, float] | None, list[str]] | None:
    """Resolve wine signal from primary linked Vinum Pulse dish."""
    linked_dish = session.scalars(
        select(DishRecord)
        .join(DishRecipeLinkRecord, DishRecipeLinkRecord.dish_id == DishRecord.id)
        .where(DishRecipeLinkRecord.recipe_id == recipe_id)
        .order_by(DishRecipeLinkRecord.is_primary.desc(), DishRecipeLinkRecord.confidence.desc())
    ).first()
    if linked_dish is None or not linked_dish.suggested_wine_type:
        return None
    vec = (
        float(linked_dish.body),
        float(linked_dish.acidity),
        float(linked_dish.tannins),
        float(linked_dish.fruit),
        float(linked_dish.oak),
    )
    return linked_dish.suggested_wine_type, "linked_dish", vec, [linked_dish.name]


def _signal_from_sensory_profile(
    session: Session,
    recipe_id: int,
) -> tuple[str, str, tuple[float, float, float, float, float] | None, list[str]] | None:
    """Resolve wine signal from explicit pairing.recipe_sensory_profiles."""
    profile = session.get(RecipeSensoryProfileRecord, recipe_id)
    if profile is None:
        return None
    has_vec = all(
        getattr(profile, k) is not None for k in ("body", "acidity", "tannins", "fruit", "oak")
    )
    profile_vec: tuple[float, float, float, float, float] | None = (
        (
            float(profile.body or 5),
            float(profile.acidity or 5),
            float(profile.tannins or 5),
            float(profile.fruit or 5),
            float(profile.oak or 5),
        )
        if has_vec
        else None
    )
    return profile.dominant_wine_type, "sensory_profile", profile_vec, []


def _resolve_recipe_signal(
    session: Session,
    recipe: RecipeRecord,
    affinity_rows: list[TagWineAffinityRecord],
) -> tuple[str, str, tuple[float, float, float, float, float] | None, list[str]]:
    """Resolve dominant wine type, source, optional 5D sensory profile, and matched keywords."""
    linked = _signal_from_linked_dish(session, recipe.id)
    if linked is not None:
        return linked

    explicit = _signal_from_sensory_profile(session, recipe.id)
    if explicit is not None:
        return explicit

    blob = " ".join(
        [
            recipe.title,
            recipe.subtitle,
            recipe.category,
            *(recipe.tags or []),
            *(ing.name for ing in recipe.ingredients),
        ]
    ).lower()
    scores: dict[str, float] = {}
    matched: dict[str, list[str]] = {}
    for rule in affinity_rows:
        if rule.keyword.lower() in blob:
            scores[rule.wine_type] = scores.get(rule.wine_type, 0.0) + float(rule.weight)
            matched.setdefault(rule.wine_type, []).append(rule.keyword)

    if scores:
        dominant = max(scores.items(), key=lambda item: item[1])[0]
        return dominant, "tag_affinity", None, sorted(set(matched.get(dominant, [])))

    return "Red", "fallback", None, []


def _score_recipe_for_wine(
    session: Session,
    recipe: RecipeRecord,
    wine: WineRecord,
    affinity_rows: list[TagWineAffinityRecord],
) -> CellarRecipeMatch:
    """Compute a 0-100 compatibility score between a bottle and a culinary recipe."""
    dominant_type, source, target_vec, keywords = _resolve_recipe_signal(
        session, recipe, affinity_rows
    )
    same_type = dominant_type == wine.wine_type
    base_score = 72.0 if same_type else 34.0

    if target_vec is not None:
        dist = _sensory_distance(target_vec, wine)
        sensory_bonus = max(0.0, 26.0 - dist * 3.2)
    else:
        sensory_bonus = min(18.0, len(keywords) * 4.5) if same_type else 4.0

    score = round(min(99.0, base_score + sensory_bonus), 1)
    type_es = WINE_TYPE_LABELS_ES.get(wine.wine_type, wine.wine_type)
    kw_text = f" ({', '.join(keywords[:3])})" if keywords else ""
    rationale = (
        f"Afinidad directa para {type_es}{kw_text}."
        if same_type
        else f"Maridaje de contraste con {type_es} (receta inclinada a {WINE_TYPE_LABELS_ES.get(dominant_type, dominant_type)})."
    )

    return CellarRecipeMatch(
        recipe_slug=recipe.slug,
        recipe_title=recipe.title,
        category=recipe.category,
        difficulty=recipe.difficulty,
        total_minutes=recipe.prep_minutes + recipe.cook_minutes + recipe.rest_minutes,
        compatibility_score=score,
        dominant_wine_type=dominant_type,
        resolution_source=source,
        matched_keywords=keywords[:5],
        rationale=rationale,
    )
