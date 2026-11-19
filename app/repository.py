"""PostgreSQL/SQLAlchemy repository and Vinum Pulse pairing bridge for Mise en Place MD."""

from __future__ import annotations

import math
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.database import Base
from app.db_models import (
    DishRecipeLinkRecord,
    DishRecord,
    RecipeIngredientRecord,
    RecipeRecord,
    RecipeSensoryProfileRecord,
    RecipeSubrecipeRecord,
    RecipeUtensilRecord,
    TagWineAffinityRecord,
    UtensilRecord,
    WineRecord,
)
from app.models import (
    DishRecipeLinkRequest,
    DishRecipeLinkResponse,
    GalleryPhoto,
    Ingredient,
    IterationEntry,
    Recipe,
    RecipeStep,
    RecipeUtensil,
    RecipeWineSuggestion,
    SubRecipeLink,
    TemperaturePoint,
    Timings,
    UtensilCatalogItem,
    WineSuggestionItem,
)
from app.storage import (
    list_recipes as list_markdown_recipes,
)
from app.storage import (
    load_utensils as load_yaml_utensils,
)
from app.storage import (
    slugify,
)

DEFAULT_AFFINITY_RULES: tuple[tuple[str, str, str], ...] = (
    ("carrillera", "Red", "3.00"),
    ("ibérico", "Red", "2.50"),
    ("iberico", "Red", "2.50"),
    ("ternera", "Red", "2.50"),
    ("cordero", "Red", "3.00"),
    ("caza", "Red", "3.00"),
    ("setas", "Red", "2.00"),
    ("boletus", "Red", "2.00"),
    ("trufa", "Red", "2.00"),
    ("estofado", "Red", "2.50"),
    ("guiso", "Red", "2.00"),
    ("brasa", "Red", "2.00"),
    ("fondo-oscuro", "Red", "2.00"),
    ("vino-rancio", "Fortified", "2.50"),
    ("jamón", "Fortified", "2.50"),
    ("jamon", "Fortified", "2.50"),
    ("queso-curado", "Fortified", "2.00"),
    ("chocolate", "Fortified", "2.00"),
    ("marisco", "White", "3.00"),
    ("pescado", "White", "2.50"),
    ("lubina", "White", "3.00"),
    ("rodaballo", "White", "3.00"),
    ("pulpo", "White", "2.50"),
    ("ceviche", "White", "3.00"),
    ("arroz-marinero", "White", "2.50"),
    ("ostras", "Sparkling", "3.00"),
    ("aperitivo", "Sparkling", "2.50"),
    ("fritura", "Sparkling", "2.00"),
    ("tartar", "Sparkling", "2.00"),
    ("ensalada", "Rose", "2.00"),
    ("verduras", "Rose", "1.80"),
    ("paella", "Rose", "2.00"),
    ("arroz", "Red", "1.20"),
    ("pan", "Sparkling", "1.20"),
    ("masa-madre", "Sparkling", "1.20"),
    ("postre", "Fortified", "2.50"),
)

WINE_TYPE_LABELS_ES: dict[str, str] = {
    "Red": "Tinto",
    "White": "Blanco",
    "Sparkling": "Espumoso",
    "Fortified": "Generoso / Fortificado",
    "Rose": "Rosado",
}


def _to_decimal(value: float | None) -> Decimal | None:
    """Convert optional float to Decimal safely."""
    if value is None:
        return None
    return Decimal(str(value))


def _record_to_recipe(record: RecipeRecord) -> Recipe:
    """Map a SQLAlchemy RecipeRecord with loaded relations into a Pydantic Recipe."""
    return Recipe(
        id=record.slug,
        title=record.title,
        subtitle=record.subtitle,
        category=record.category,
        is_subrecipe=record.is_subrecipe,
        difficulty=record.difficulty,
        rating=float(record.rating),
        servings=float(record.servings),
        yield_unit=record.yield_unit,
        scaling_mode=(
            "bakers_pct" if record.scaling_mode == "bakers_pct" else "servings"
        ),
        techniques=list(record.techniques or []),
        tags=list(record.tags or []),
        timings=Timings(
            prep_minutes=record.prep_minutes,
            cook_minutes=record.cook_minutes,
            rest_minutes=record.rest_minutes,
            rest_notes=record.rest_notes,
        ),
        temperatures=[
            TemperaturePoint.model_validate(tp) for tp in (record.temperatures or [])
        ],
        utensils=[
            RecipeUtensil(
                utensil_id=link.utensil.slug,
                name=link.name or link.utensil.name,
                mandatory=link.mandatory,
                notes=link.notes,
            )
            for link in record.utensil_links
        ],
        subrecipes=[
            SubRecipeLink(
                recipe_id=link.child_recipe.slug,
                name=link.name or link.child_recipe.title,
                amount=float(link.amount) if link.amount is not None else None,
                unit=link.unit,
                notes=link.notes,
            )
            for link in record.subrecipe_links
        ],
        ingredients=[
            Ingredient(
                name=ing.name,
                amount=float(ing.amount) if ing.amount is not None else None,
                unit=ing.unit,
                group=ing.ingredient_group,
                is_base_weight=ing.is_base_weight,
                notes=ing.notes,
            )
            for ing in record.ingredients
        ],
        steps=[RecipeStep.model_validate(st) for st in (record.steps or [])],
        plating_notes=record.plating_notes,
        chef_notes=record.chef_notes,
        iterations=[
            IterationEntry.model_validate(it) for it in (record.iterations or [])
        ],
        cover_photo=record.cover_photo_url,
        gallery=[GalleryPhoto.model_validate(ph) for ph in (record.gallery or [])],
        created_at=record.created_at.strftime("%Y-%m-%d %H:%M"),
        updated_at=record.updated_at.strftime("%Y-%m-%d %H:%M"),
    )


def _record_to_utensil(record: UtensilRecord) -> UtensilCatalogItem:
    """Map a SQLAlchemy UtensilRecord into a Pydantic UtensilCatalogItem."""
    return UtensilCatalogItem(
        id=record.slug,
        name=record.name,
        category=record.category,
        owned=record.owned,
        specs=record.specs,
    )


def _wine_to_suggestion(wine: WineRecord, vinum_base_url: str) -> WineSuggestionItem:
    """Map an enology.wines row to a WineSuggestionItem with deep-link URL."""
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
        glass_type=wine.glass_type,
        tagline=wine.tagline,
        vinum_url=f"{base}/#carte?wine={wine.slug}",
    )


def _percentile(sorted_values: list[float], pct: float) -> float:
    """Compute linear-interpolated percentile on a non-empty sorted list."""
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * pct
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return sorted_values[low]
    weight = pos - low
    return sorted_values[low] * (1.0 - weight) + sorted_values[high] * weight


def _sensory_distance(
    target: tuple[float, float, float, float, float],
    wine: WineRecord,
) -> float:
    """Compute 5D Euclidean sensory distance between target profile and wine."""
    return math.sqrt(
        (target[0] - float(wine.body)) ** 2
        + (target[1] - float(wine.acidity)) ** 2
        + (target[2] - float(wine.tannins)) ** 2
        + (target[3] - float(wine.fruit)) ** 2
        + (target[4] - float(wine.oak)) ** 2
    )


class RecipeRepository:
    """Relational persistence and Vinum Pulse pairing service for Mise en Place MD."""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def init_and_seed(
        self,
        db_engine: Engine,
        import_markdown_files: bool = True,
    ) -> None:
        """Create schema tables if absent (SQLite/fresh DB) and seed initial data."""
        if db_engine.dialect.name == "sqlite":
            Base.metadata.create_all(bind=db_engine)

        with self._session_factory() as session:
            existing_affinities = session.scalars(select(TagWineAffinityRecord)).first()
            if existing_affinities is None:
                session.add_all(
                    [
                        TagWineAffinityRecord(
                            keyword=kw,
                            wine_type=wtype,
                            weight=Decimal(weight),
                        )
                        for kw, wtype, weight in DEFAULT_AFFINITY_RULES
                    ]
                )
                session.commit()

            if not import_markdown_files:
                return

            if session.scalars(select(UtensilRecord)).first() is None:
                for item in load_yaml_utensils():
                    self._upsert_utensil_in_session(session, item)
                session.commit()

            if session.scalars(select(RecipeRecord)).first() is None:
                md_recipes = list_markdown_recipes()
                # Insert sub-recipes first so foreign keys resolve cleanly.
                ordered = sorted(md_recipes, key=lambda r: (not r.is_subrecipe, r.id))
                for recipe in ordered:
                    self._save_recipe_in_session(session, recipe)
                session.commit()

    def _recipe_query(self) -> Any:
        """Build eager-loaded recipe SELECT statement (avoids N+1 queries)."""
        return select(RecipeRecord).options(
            selectinload(RecipeRecord.ingredients),
            selectinload(RecipeRecord.utensil_links).selectinload(
                RecipeUtensilRecord.utensil
            ),
            selectinload(RecipeRecord.subrecipe_links).selectinload(
                RecipeSubrecipeRecord.child_recipe
            ),
        )

    def list_recipes(
        self,
        q: str | None = None,
        category: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Recipe]:
        """List recipes ordered alphabetically with optional category/text filters."""
        with self._session_factory() as session:
            stmt = self._recipe_query()
            if category:
                stmt = stmt.where(RecipeRecord.category.ilike(f"%{category.strip()}%"))
            if q:
                pattern = f"%{q.strip()}%"
                stmt = stmt.where(
                    RecipeRecord.title.ilike(pattern)
                    | RecipeRecord.subtitle.ilike(pattern)
                    | RecipeRecord.chef_notes.ilike(pattern)
                )
            stmt = stmt.order_by(RecipeRecord.title.asc()).offset(offset).limit(limit)
            rows = session.scalars(stmt).all()
            return [_record_to_recipe(row) for row in rows]

    def get_recipe(self, slug: str) -> Recipe | None:
        """Fetch a single recipe by its URL-safe slug."""
        with self._session_factory() as session:
            stmt = self._recipe_query().where(RecipeRecord.slug == slug)
            row = session.scalars(stmt).first()
            return _record_to_recipe(row) if row is not None else None

    def save_recipe(
        self,
        recipe: Recipe,
        previous_slug: str | None = None,
    ) -> Recipe:
        """Create or update a recipe and all normalized child rows atomically."""
        with self._session_factory() as session:
            saved = self._save_recipe_in_session(
                session,
                recipe,
                previous_slug=previous_slug,
            )
            session.commit()
            stmt = self._recipe_query().where(RecipeRecord.id == saved.id)
            reloaded = session.scalars(stmt).one()
            return _record_to_recipe(reloaded)

    def _resolve_unique_slug(
        self,
        session: Session,
        desired_slug: str,
        exclude_id: int | None = None,
    ) -> str:
        """Generate a unique slug inside culinary.recipes."""
        base_slug = slugify(desired_slug)
        candidate = base_slug
        counter = 2
        while True:
            existing = session.scalars(
                select(RecipeRecord).where(RecipeRecord.slug == candidate)
            ).first()
            if existing is None or existing.id == exclude_id:
                return candidate
            candidate = f"{base_slug}-{counter}"
            counter += 1

    def _save_recipe_in_session(
        self,
        session: Session,
        recipe: Recipe,
        previous_slug: str | None = None,
    ) -> RecipeRecord:
        """Upsert recipe record inside an active transaction."""
        lookup_slug = previous_slug or recipe.id
        record: RecipeRecord | None = None
        if lookup_slug:
            record = session.scalars(
                self._recipe_query().where(RecipeRecord.slug == lookup_slug)
            ).first()

        target_slug = self._resolve_unique_slug(
            session,
            recipe.id or recipe.title,
            exclude_id=record.id if record is not None else None,
        )

        # Normalize sequential step order
        ordered_steps = []
        for idx, step in enumerate(recipe.steps, start=1):
            step_data = step.model_dump()
            step_data["order"] = idx
            ordered_steps.append(step_data)

        if record is None:
            record = RecipeRecord(slug=target_slug, title=recipe.title)
            session.add(record)

        record.slug = target_slug
        record.title = recipe.title
        record.subtitle = recipe.subtitle
        record.category = recipe.category
        record.is_subrecipe = recipe.is_subrecipe
        record.difficulty = recipe.difficulty
        record.rating = Decimal(str(recipe.rating))
        record.servings = Decimal(str(recipe.servings))
        record.yield_unit = recipe.yield_unit
        record.scaling_mode = recipe.scaling_mode
        record.prep_minutes = recipe.timings.prep_minutes
        record.cook_minutes = recipe.timings.cook_minutes
        record.rest_minutes = recipe.timings.rest_minutes
        record.rest_notes = recipe.timings.rest_notes
        record.tags = list(recipe.tags)
        record.techniques = list(recipe.techniques)
        record.steps = ordered_steps
        record.temperatures = [tp.model_dump() for tp in recipe.temperatures]
        record.iterations = [it.model_dump() for it in recipe.iterations]
        record.plating_notes = recipe.plating_notes
        record.chef_notes = recipe.chef_notes
        record.cover_photo_url = recipe.cover_photo
        record.gallery = [ph.model_dump() for ph in recipe.gallery]

        session.flush()

        # Replace ingredients
        record.ingredients.clear()
        for pos, ing in enumerate(recipe.ingredients):
            record.ingredients.append(
                RecipeIngredientRecord(
                    position=pos,
                    name=ing.name,
                    amount=_to_decimal(ing.amount),
                    unit=ing.unit,
                    ingredient_group=ing.group or "Principal",
                    is_base_weight=ing.is_base_weight,
                    notes=ing.notes,
                )
            )

        # Replace utensil links (auto-creating missing catalog entries)
        record.utensil_links.clear()
        seen_utensil_ids: set[int] = set()
        for ru in recipe.utensils:
            utensil_slug = slugify(ru.utensil_id or ru.name)
            utensil = session.scalars(
                select(UtensilRecord).where(UtensilRecord.slug == utensil_slug)
            ).first()
            if utensil is None:
                utensil = UtensilRecord(slug=utensil_slug, name=ru.name or utensil_slug)
                session.add(utensil)
                session.flush()
            if utensil.id not in seen_utensil_ids:
                seen_utensil_ids.add(utensil.id)
                record.utensil_links.append(
                    RecipeUtensilRecord(
                        utensil_id=utensil.id,
                        name=ru.name or utensil.name,
                        mandatory=ru.mandatory,
                        notes=ru.notes,
                    )
                )

        # Replace subrecipe links (only for existing child recipes, avoiding self-loops)
        record.subrecipe_links.clear()
        seen_child_ids: set[int] = set()
        for sr in recipe.subrecipes:
            child = session.scalars(
                select(RecipeRecord).where(RecipeRecord.slug == sr.recipe_id)
            ).first()
            if child is not None and child.id != record.id and child.id not in seen_child_ids:
                seen_child_ids.add(child.id)
                record.subrecipe_links.append(
                    RecipeSubrecipeRecord(
                        child_recipe_id=child.id,
                        name=sr.name or child.title,
                        amount=_to_decimal(sr.amount),
                        unit=sr.unit,
                        notes=sr.notes,
                    )
                )

        session.flush()
        return record

    def delete_recipe(self, slug: str) -> bool:
        """Delete a recipe by slug."""
        with self._session_factory() as session:
            record = session.scalars(
                select(RecipeRecord).where(RecipeRecord.slug == slug)
            ).first()
            if record is None:
                return False
            session.delete(record)
            session.commit()
            return True

    def list_utensils(self) -> list[UtensilCatalogItem]:
        """List all utensils ordered by category and name."""
        with self._session_factory() as session:
            rows = session.scalars(
                select(UtensilRecord).order_by(
                    UtensilRecord.category.asc(),
                    UtensilRecord.name.asc(),
                )
            ).all()
            return [_record_to_utensil(row) for row in rows]

    def _upsert_utensil_in_session(
        self,
        session: Session,
        item: UtensilCatalogItem,
    ) -> UtensilRecord:
        """Insert or update a utensil row in the active session."""
        target_slug = slugify(item.id or item.name)
        record = session.scalars(
            select(UtensilRecord).where(UtensilRecord.slug == target_slug)
        ).first()
        if record is None:
            record = UtensilRecord(slug=target_slug, name=item.name)
            session.add(record)
        record.name = item.name
        record.category = item.category
        record.owned = item.owned
        record.specs = item.specs
        session.flush()
        return record

    def save_utensils(
        self, items: list[UtensilCatalogItem]
    ) -> list[UtensilCatalogItem]:
        """Upsert a batch of utensils into culinary.utensils."""
        with self._session_factory() as session:
            for item in items:
                self._upsert_utensil_in_session(session, item)
            session.commit()
        return self.list_utensils()

    def upsert_utensil(self, item: UtensilCatalogItem) -> UtensilCatalogItem:
        """Upsert a single utensil and return its persisted contract."""
        with self._session_factory() as session:
            record = self._upsert_utensil_in_session(session, item)
            session.commit()
            return _record_to_utensil(record)

    def link_dish_to_recipe(
        self, payload: DishRecipeLinkRequest
    ) -> DishRecipeLinkResponse:
        """Bind a Vinum Pulse dish slug to a Mise en Place recipe slug."""
        with self._session_factory() as session:
            dish = session.scalars(
                select(DishRecord).where(DishRecord.slug == payload.dish_slug)
            ).first()
            if dish is None:
                raise ValueError(f"Dish '{payload.dish_slug}' not found in enology.dishes.")

            recipe = session.scalars(
                select(RecipeRecord).where(RecipeRecord.slug == payload.recipe_slug)
            ).first()
            if recipe is None:
                raise ValueError(f"Recipe '{payload.recipe_slug}' not found in culinary.recipes.")

            if payload.is_primary:
                existing_primaries = session.scalars(
                    select(DishRecipeLinkRecord).where(
                        DishRecipeLinkRecord.dish_id == dish.id,
                        DishRecipeLinkRecord.is_primary.is_(True),
                        DishRecipeLinkRecord.recipe_id != recipe.id,
                    )
                ).all()
                for prev in existing_primaries:
                    prev.is_primary = False
                session.flush()

            link = session.scalars(
                select(DishRecipeLinkRecord).where(
                    DishRecipeLinkRecord.dish_id == dish.id,
                    DishRecipeLinkRecord.recipe_id == recipe.id,
                )
            ).first()
            if link is None:
                link = DishRecipeLinkRecord(
                    dish_id=dish.id,
                    recipe_id=recipe.id,
                )
                session.add(link)

            link.is_primary = payload.is_primary
            link.match_source = payload.match_source
            link.confidence = Decimal(str(payload.confidence))
            session.commit()
            return DishRecipeLinkResponse(
                dish_slug=dish.slug,
                recipe_slug=recipe.slug,
                is_primary=link.is_primary,
                match_source=link.match_source,
                confidence=float(link.confidence),
            )

    def _resolve_dominant_wine_type(
        self,
        session: Session,
        recipe: RecipeRecord,
    ) -> tuple[
        str,
        Literal["linked_dish", "sensory_profile", "tag_affinity", "fallback"],
        tuple[float, float, float, float, float] | None,
        list[str],
    ]:
        """Resolve dominant wine typology using the 3-level ADR-0030 fallback chain."""
        # Level 1: Direct linked dish in Vinum Pulse
        link_stmt = (
            select(DishRecord)
            .join(DishRecipeLinkRecord, DishRecipeLinkRecord.dish_id == DishRecord.id)
            .where(DishRecipeLinkRecord.recipe_id == recipe.id)
            .order_by(
                DishRecipeLinkRecord.is_primary.desc(),
                DishRecipeLinkRecord.confidence.desc(),
            )
        )
        linked_dish = session.scalars(link_stmt).first()
        if linked_dish is not None and linked_dish.suggested_wine_type:
            target = (
                float(linked_dish.body),
                float(linked_dish.acidity),
                float(linked_dish.tannins),
                float(linked_dish.fruit),
                float(linked_dish.oak),
            )
            return linked_dish.suggested_wine_type, "linked_dish", target, [linked_dish.name]

        # Level 2: Explicit recipe sensory profile
        profile = session.get(RecipeSensoryProfileRecord, recipe.id)
        if profile is not None:
            profile_target: tuple[float, float, float, float, float] | None = None
            if (
                profile.body is not None
                and profile.acidity is not None
                and profile.tannins is not None
                and profile.fruit is not None
                and profile.oak is not None
            ):
                profile_target = (
                    float(profile.body),
                    float(profile.acidity),
                    float(profile.tannins),
                    float(profile.fruit),
                    float(profile.oak),
                )
            return profile.dominant_wine_type, "sensory_profile", profile_target, []

        # Level 3: Weighted majority vote across pairing.tag_wine_affinity
        searchable_blob = " ".join(
            [
                recipe.title,
                recipe.subtitle,
                recipe.category,
                *(recipe.tags or []),
                *(ing.name for ing in recipe.ingredients),
            ]
        ).lower()

        affinity_rows = session.scalars(select(TagWineAffinityRecord)).all()
        scores: dict[str, float] = {}
        matched_by_type: dict[str, list[str]] = {}
        for rule in affinity_rows:
            kw = rule.keyword.lower()
            if kw in searchable_blob:
                scores[rule.wine_type] = scores.get(rule.wine_type, 0.0) + float(rule.weight)
                matched_by_type.setdefault(rule.wine_type, []).append(rule.keyword)

        if scores:
            dominant = max(scores.items(), key=lambda item: item[1])[0]
            keywords = sorted(set(matched_by_type.get(dominant, [])))
            return dominant, "tag_affinity", None, keywords

        # Fallback: Most frequent wine type in enology.wines (typically Red)
        return "Red", "fallback", None, []

    def suggest_wine_for_recipe(
        self,
        slug: str,
        vinum_base_url: str,
    ) -> RecipeWineSuggestion | None:
        """Suggest a mid-price wine of the dominant/most habitual type for a recipe."""
        with self._session_factory() as session:
            recipe = session.scalars(
                self._recipe_query().where(RecipeRecord.slug == slug)
            ).first()
            if recipe is None:
                return None

            dominant_type, source, target_sensory, matched_keywords = (
                self._resolve_dominant_wine_type(session, recipe)
            )

            wines = list(
                session.scalars(
                    select(WineRecord)
                    .where(WineRecord.wine_type == dominant_type)
                    .order_by(WineRecord.price_eur.asc())
                ).all()
            )
            if not wines:
                wines = list(
                    session.scalars(
                        select(WineRecord).order_by(WineRecord.price_eur.asc())
                    ).all()
                )
            if not wines:
                raise ValueError(
                    "No wines available in enology.wines. Seed Vinum Pulse catalog first."
                )

            prices = [float(w.price_eur) for w in wines]
            median_price = round(_percentile(prices, 0.50), 2)
            p35 = round(_percentile(prices, 0.35), 2)
            p65 = round(_percentile(prices, 0.65), 2)

            mid_band_wines = [
                w for w in wines if p35 <= float(w.price_eur) <= p65
            ] or wines

            if target_sensory is not None:
                ranked = sorted(
                    mid_band_wines,
                    key=lambda w: (
                        _sensory_distance(target_sensory, w),
                        abs(float(w.price_eur) - median_price),
                    ),
                )
            else:
                ranked = sorted(
                    mid_band_wines,
                    key=lambda w: abs(float(w.price_eur) - median_price),
                )

            primary = ranked[0]
            alternatives = ranked[1:3]
            label_es = WINE_TYPE_LABELS_ES.get(dominant_type, dominant_type)
            kw_note = (
                f" a partir de coincidencias culinarias ({', '.join(matched_keywords[:5])})"
                if matched_keywords
                else ""
            )
            rationale = (
                f"Tipología dominante: {label_es}{kw_note}. "
                f"Seleccionado en la banda de precio medio ({p35:.2f} € – {p65:.2f} €, "
                f"mediana {median_price:.2f} €): {primary.name} ({primary.appellation}, "
                f"{float(primary.price_eur):.2f} €)."
            )

            return RecipeWineSuggestion(
                recipe_slug=recipe.slug,
                recipe_title=recipe.title,
                dominant_wine_type=dominant_type,
                resolution_source=source,
                median_price_eur=median_price,
                mid_price_band_eur=(p35, p65),
                recommended_wine=_wine_to_suggestion(primary, vinum_base_url),
                alternatives=[
                    _wine_to_suggestion(alt, vinum_base_url) for alt in alternatives
                ],
                matched_keywords=matched_keywords,
                rationale=rationale,
            )


def safe_media_filename(raw_filename: str) -> tuple[str, str]:
    """Validate and sanitize an uploaded image filename against path traversal."""
    path = Path(raw_filename or "image.jpg")
    ext = path.suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        ext = ".jpg"
    return slugify(path.stem)[:40], ext
