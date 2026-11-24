"""PostgreSQL/SQLAlchemy repository and Vinum Pulse pairing bridge for Mise en Place MD."""

from __future__ import annotations

import math
import shlex
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import Engine, Text, func, select, type_coerce
from sqlalchemy.dialects.postgresql import ARRAY, TSVECTOR
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


class SubrecipeCycleError(ValueError):
    """Raised when saving recipe_subrecipes would introduce a circular dependency."""

    def __init__(self, cycle_path: list[str]) -> None:
        self.cycle_path = cycle_path
        super().__init__(f"Circular sub-recipe reference detected: {' -> '.join(cycle_path)}")


def _find_cycle_from_node(start_id: int, adj: dict[int, list[int]]) -> list[int] | None:
    """Run 3-color DFS from start_id to detect any directed cycle and return its node IDs."""
    visit_state: dict[int, int] = {}  # absent=unvisited, 1=visiting, 2=visited
    path: list[int] = []

    def dfs(node: int) -> list[int] | None:
        visit_state[node] = 1
        path.append(node)
        for nxt in adj.get(node, ()):
            nxt_state = visit_state.get(nxt, 0)
            if nxt_state == 1:
                cycle_start = path.index(nxt)
                return [*path[cycle_start:], nxt]
            if nxt_state == 0:
                found = dfs(nxt)
                if found is not None:
                    return found
        path.pop()
        visit_state[node] = 2
        return None

    return dfs(start_id)


RecipeSortBy = Literal[
    "relevance",
    "title_asc",
    "title_desc",
    "updated_desc",
    "rating_desc",
    "difficulty_asc",
    "difficulty_desc",
    "active_time_asc",
    "total_time_asc",
]


def _parse_csv_terms(raw: str | None) -> list[str]:
    """Split a comma-separated filter string into lowercase non-empty terms."""
    if not raw:
        return []
    return [part.strip().lower() for part in raw.split(",") if part.strip()]


def _has_websearch_operators(query: str) -> bool:
    """Detect whether a search string uses PostgreSQL websearch boolean operators."""
    padded = f" {query.lower()} "
    return '"' in query or query.startswith("-") or " -" in query or " or " in padded


def _tokenize_search_query(query: str) -> tuple[list[str], list[str]]:
    """Split a search query into positive and excluded lowercase terms."""
    try:
        tokens = shlex.split(query)
    except ValueError:
        tokens = query.split()

    positive: list[str] = []
    excluded: list[str] = []
    for token in tokens:
        cleaned = token.strip()
        if not cleaned or cleaned.lower() == "or":
            continue
        if cleaned.startswith("-") and len(cleaned) > 1:
            excluded.append(cleaned[1:].lower())
        else:
            positive.append(cleaned.lower())
    return positive, excluded


def _sqlite_fts_score(record: RecipeRecord, query: str) -> float | None:
    """Compute a PostgreSQL-compatible relevance score fallback for SQLite unit tests."""
    positive, excluded = _tokenize_search_query(query)
    title_l = record.title.lower()
    subtitle_l = record.subtitle.lower()
    notes_l = record.chef_notes.lower()
    tags_l = [t.lower() for t in (record.tags or [])]
    fts_blob = f"{title_l} {subtitle_l} {notes_l}"

    if any(term in fts_blob for term in excluded):
        return None
    if not positive:
        return 0.0

    use_or = " or " in f" {query.lower()} " and not excluded and '"' not in query
    allow_tags = not _has_websearch_operators(query)
    score = 0.0
    matched_count = 0

    for term in positive:
        term_score = 0.0
        if term in title_l:
            term_score += 3.0
        if term in subtitle_l:
            term_score += 2.0
        if term in notes_l:
            term_score += 1.0
        if allow_tags and any(term in tag for tag in tags_l):
            term_score += 0.5
        if term_score > 0.0:
            matched_count += 1
            score += term_score

    if use_or:
        return score if matched_count > 0 else None
    return score if matched_count == len(positive) else None


def _sort_sqlite_rows(
    scored_rows: list[tuple[RecipeRecord, float]],
    sort_by: str,
) -> list[RecipeRecord]:
    """Sort eager-loaded recipe rows deterministically in SQLite fallback mode."""
    ordered = sorted(scored_rows, key=lambda item: item[0].title.lower())
    if sort_by == "title_asc":
        return [row for row, _ in ordered]
    if sort_by == "title_desc":
        ordered.sort(key=lambda item: item[0].title.lower(), reverse=True)
        return [row for row, _ in ordered]

    key_map: dict[str, tuple[Any, bool]] = {
        "relevance": (lambda item: item[1], True),
        "updated_desc": (lambda item: item[0].updated_at, True),
        "rating_desc": (lambda item: float(item[0].rating), True),
        "difficulty_asc": (lambda item: item[0].difficulty, False),
        "difficulty_desc": (lambda item: item[0].difficulty, True),
        "active_time_asc": (lambda item: item[0].prep_minutes + item[0].cook_minutes, False),
        "total_time_asc": (
            lambda item: item[0].prep_minutes + item[0].cook_minutes + item[0].rest_minutes,
            False,
        ),
    }
    key_fn, reverse = key_map.get(sort_by, (lambda item: item[0].title.lower(), False))
    ordered.sort(key=key_fn, reverse=reverse)
    return [row for row, _ in ordered]


def _postgres_order_by(sort_by: str, rank_expr: Any) -> tuple[Any, ...]:
    """Map sort_by selector to PostgreSQL ORDER BY SQLAlchemy expressions."""
    if sort_by == "relevance":
        if rank_expr is not None:
            return (rank_expr.desc(), RecipeRecord.title.asc())
        return (RecipeRecord.updated_at.desc(), RecipeRecord.title.asc())

    order_map: dict[str, tuple[Any, ...]] = {
        "title_asc": (RecipeRecord.title.asc(),),
        "title_desc": (RecipeRecord.title.desc(),),
        "updated_desc": (RecipeRecord.updated_at.desc(), RecipeRecord.title.asc()),
        "rating_desc": (RecipeRecord.rating.desc(), RecipeRecord.title.asc()),
        "difficulty_asc": (RecipeRecord.difficulty.asc(), RecipeRecord.title.asc()),
        "difficulty_desc": (RecipeRecord.difficulty.desc(), RecipeRecord.title.asc()),
        "active_time_asc": (
            (RecipeRecord.prep_minutes + RecipeRecord.cook_minutes).asc(),
            RecipeRecord.title.asc(),
        ),
        "total_time_asc": (
            (
                RecipeRecord.prep_minutes + RecipeRecord.cook_minutes + RecipeRecord.rest_minutes
            ).asc(),
            RecipeRecord.title.asc(),
        ),
    }
    return order_map.get(sort_by, (RecipeRecord.title.asc(),))


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
        scaling_mode=("bakers_pct" if record.scaling_mode == "bakers_pct" else "servings"),
        techniques=list(record.techniques or []),
        tags=list(record.tags or []),
        timings=Timings(
            prep_minutes=record.prep_minutes,
            cook_minutes=record.cook_minutes,
            rest_minutes=record.rest_minutes,
            rest_notes=record.rest_notes,
        ),
        temperatures=[TemperaturePoint.model_validate(tp) for tp in (record.temperatures or [])],
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
        iterations=[IterationEntry.model_validate(it) for it in (record.iterations or [])],
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

            existing_slugs = set(session.scalars(select(RecipeRecord.slug)).all())
            md_recipes = [r for r in list_markdown_recipes() if r.id and r.id not in existing_slugs]
            if md_recipes:
                # Insert sub-recipes first so foreign keys resolve cleanly.
                ordered = sorted(md_recipes, key=lambda r: (not r.is_subrecipe, r.id))
                for recipe in ordered:
                    self._save_recipe_in_session(session, recipe)
                session.commit()

            self._auto_link_matching_dishes_in_session(session)
            session.commit()

    def _auto_link_matching_dishes_in_session(self, session: Session) -> int:
        """Create primary curated dish-recipe links when dish.slug == recipe.slug."""
        dishes = list(session.scalars(select(DishRecord)).all())
        if not dishes:
            return 0

        recipes_by_slug = {
            slug: recipe_id
            for recipe_id, slug in session.execute(select(RecipeRecord.id, RecipeRecord.slug)).all()
        }
        primary_dish_ids = set(
            session.scalars(
                select(DishRecipeLinkRecord.dish_id).where(
                    DishRecipeLinkRecord.is_primary.is_(True)
                )
            ).all()
        )
        existing_pairs: set[tuple[int, int]] = {
            (int(d_id), int(r_id))
            for d_id, r_id in session.execute(
                select(DishRecipeLinkRecord.dish_id, DishRecipeLinkRecord.recipe_id)
            ).all()
        }

        created = 0
        for dish in dishes:
            recipe_id = recipes_by_slug.get(dish.slug)
            if recipe_id is None:
                continue
            if dish.id in primary_dish_ids or (dish.id, recipe_id) in existing_pairs:
                continue
            session.add(
                DishRecipeLinkRecord(
                    dish_id=dish.id,
                    recipe_id=recipe_id,
                    is_primary=True,
                    match_source="curated",
                    confidence=Decimal("1.000"),
                )
            )
            primary_dish_ids.add(dish.id)
            existing_pairs.add((dish.id, recipe_id))
            created += 1
        return created

    def _recipe_query(self) -> Any:
        """Build eager-loaded recipe SELECT statement (avoids N+1 queries)."""
        return select(RecipeRecord).options(
            selectinload(RecipeRecord.ingredients),
            selectinload(RecipeRecord.utensil_links).selectinload(RecipeUtensilRecord.utensil),
            selectinload(RecipeRecord.subrecipe_links).selectinload(
                RecipeSubrecipeRecord.child_recipe
            ),
        )

    def _apply_common_recipe_filters(
        self,
        stmt: Any,
        *,
        category: str | None = None,
        utensil_id: str | None = None,
        cookable: bool = False,
        is_subrecipe: bool | None = None,
        ing_include: str | None = None,
        ing_exclude: str | None = None,
    ) -> Any:
        """Apply SQL-portable filters shared by PostgreSQL and SQLite."""
        if category and category.strip():
            stmt = stmt.where(RecipeRecord.category.ilike(f"%{category.strip()}%"))
        if is_subrecipe is not None:
            stmt = stmt.where(RecipeRecord.is_subrecipe.is_(is_subrecipe))
        if utensil_id and utensil_id.strip():
            u_slug = utensil_id.strip()
            stmt = stmt.where(
                RecipeRecord.utensil_links.any(
                    RecipeUtensilRecord.utensil.has(UtensilRecord.slug == u_slug)
                )
            )
        if cookable:
            missing_mandatory = (
                select(RecipeUtensilRecord.recipe_id)
                .join(UtensilRecord, UtensilRecord.id == RecipeUtensilRecord.utensil_id)
                .where(
                    RecipeUtensilRecord.recipe_id == RecipeRecord.id,
                    RecipeUtensilRecord.mandatory.is_(True),
                    UtensilRecord.owned.is_(False),
                )
                .exists()
            )
            stmt = stmt.where(~missing_mandatory)
        for term in _parse_csv_terms(ing_include):
            stmt = stmt.where(
                RecipeRecord.ingredients.any(
                    RecipeIngredientRecord.name.ilike(f"%{term}%")
                    | RecipeIngredientRecord.notes.ilike(f"%{term}%")
                )
            )
        for term in _parse_csv_terms(ing_exclude):
            stmt = stmt.where(
                ~RecipeRecord.ingredients.any(
                    RecipeIngredientRecord.name.ilike(f"%{term}%")
                    | RecipeIngredientRecord.notes.ilike(f"%{term}%")
                )
            )
        return stmt

    def list_recipes(
        self,
        q: str | None = None,
        category: str | None = None,
        tag: str | None = None,
        technique: str | None = None,
        utensil_id: str | None = None,
        cookable: bool = False,
        is_subrecipe: bool | None = None,
        ing_include: str | None = None,
        ing_exclude: str | None = None,
        sort_by: RecipeSortBy | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Recipe]:
        """List recipes with server-side FTS/GIN search, filters, and sorting."""
        q_clean = q.strip() if q and q.strip() else None
        tag_clean = tag.strip() if tag and tag.strip() else None
        tech_clean = technique.strip() if technique and technique.strip() else None
        effective_sort: str = sort_by or ("relevance" if q_clean else "title_asc")

        with self._session_factory() as session:
            stmt = self._apply_common_recipe_filters(
                self._recipe_query(),
                category=category,
                utensil_id=utensil_id,
                cookable=cookable,
                is_subrecipe=is_subrecipe,
                ing_include=ing_include,
                ing_exclude=ing_exclude,
            )
            dialect_name = session.bind.dialect.name if session.bind is not None else "sqlite"

            if dialect_name == "postgresql":
                if tag_clean:
                    stmt = stmt.where(
                        type_coerce(RecipeRecord.tags, ARRAY(Text)).contains([tag_clean])
                    )
                if tech_clean:
                    stmt = stmt.where(
                        type_coerce(RecipeRecord.techniques, ARRAY(Text)).contains([tech_clean])
                    )
                rank_expr: Any = None
                if q_clean:
                    ts_vec = type_coerce(RecipeRecord.search_tsv, TSVECTOR)
                    ts_query = func.websearch_to_tsquery("spanish", q_clean)
                    fts_match = ts_vec.bool_op("@@")(ts_query)
                    rank_expr = func.ts_rank(ts_vec, ts_query)
                    if _has_websearch_operators(q_clean):
                        stmt = stmt.where(fts_match)
                    else:
                        q_tokens = list(
                            dict.fromkeys(tok.lower() for tok in q_clean.split() if tok.strip())
                        )
                        stmt = stmt.where(
                            fts_match
                            | type_coerce(RecipeRecord.tags, ARRAY(Text)).overlap(q_tokens)
                            if q_tokens
                            else fts_match
                        )
                stmt = stmt.order_by(*_postgres_order_by(effective_sort, rank_expr))
                stmt = stmt.offset(offset).limit(limit)
                return [_record_to_recipe(row) for row in session.scalars(stmt).all()]

            # SQLite fallback for in-memory tests: evaluate JSON array filters and FTS cleanly
            candidates = list(session.scalars(stmt).all())
            scored: list[tuple[RecipeRecord, float]] = []
            for row in candidates:
                if tag_clean and not any(t.lower() == tag_clean.lower() for t in (row.tags or [])):
                    continue
                if tech_clean and not any(
                    t.lower() == tech_clean.lower() for t in (row.techniques or [])
                ):
                    continue
                score = 0.0
                if q_clean:
                    maybe_score = _sqlite_fts_score(row, q_clean)
                    if maybe_score is None:
                        continue
                    score = maybe_score
                scored.append((row, score))

            ordered_rows = _sort_sqlite_rows(scored, effective_sort)
            sliced = ordered_rows[offset : offset + limit]
            return [_record_to_recipe(row) for row in sliced]

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
            try:
                saved = self._save_recipe_in_session(
                    session,
                    recipe,
                    previous_slug=previous_slug,
                )
                session.commit()
            except Exception:
                session.rollback()
                raise
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

    def _validate_subrecipe_dag(
        self,
        session: Session,
        parent_id: int,
        parent_slug: str,
        child_ids: list[int],
    ) -> None:
        """Verify that assigning child_ids to parent_id preserves an acyclic DAG."""
        if not child_ids:
            return
        if parent_id in child_ids:
            raise SubrecipeCycleError([parent_slug, parent_slug])

        adj: dict[int, list[int]] = {}
        for edge_parent, edge_child in session.execute(
            select(RecipeSubrecipeRecord.parent_recipe_id, RecipeSubrecipeRecord.child_recipe_id)
        ).all():
            p_id = int(edge_parent)
            if p_id != parent_id:
                adj.setdefault(p_id, []).append(int(edge_child))
        adj[parent_id] = list(child_ids)

        cycle_ids = _find_cycle_from_node(parent_id, adj)
        if cycle_ids is not None:
            id_to_slug = {
                int(rid): rslug
                for rid, rslug in session.execute(select(RecipeRecord.id, RecipeRecord.slug)).all()
            }
            id_to_slug[parent_id] = parent_slug
            cycle_slugs = [id_to_slug.get(node_id, str(node_id)) for node_id in cycle_ids]
            raise SubrecipeCycleError(cycle_slugs)

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

        # Validate and replace subrecipe links (enforcing acyclic DAG)
        resolved_subrecipes: list[tuple[SubRecipeLink, RecipeRecord]] = []
        seen_child_ids: set[int] = set()
        for sr in recipe.subrecipes:
            if sr.recipe_id == target_slug or slugify(sr.recipe_id) == target_slug:
                raise SubrecipeCycleError([target_slug, target_slug])
            child = session.scalars(
                select(RecipeRecord).where(RecipeRecord.slug == sr.recipe_id)
            ).first()
            if child is not None:
                if child.id == record.id:
                    raise SubrecipeCycleError([target_slug, target_slug])
                if child.id not in seen_child_ids:
                    seen_child_ids.add(child.id)
                    resolved_subrecipes.append((sr, child))

        self._validate_subrecipe_dag(
            session=session,
            parent_id=record.id,
            parent_slug=target_slug,
            child_ids=[child.id for _, child in resolved_subrecipes],
        )

        record.subrecipe_links.clear()
        for sr, child in resolved_subrecipes:
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
            record = session.scalars(select(RecipeRecord).where(RecipeRecord.slug == slug)).first()
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

    def save_utensils(self, items: list[UtensilCatalogItem]) -> list[UtensilCatalogItem]:
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

    def link_dish_to_recipe(self, payload: DishRecipeLinkRequest) -> DishRecipeLinkResponse:
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
            recipe = session.scalars(self._recipe_query().where(RecipeRecord.slug == slug)).first()
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
                    session.scalars(select(WineRecord).order_by(WineRecord.price_eur.asc())).all()
                )
            if not wines:
                raise ValueError(
                    "No wines available in enology.wines. Seed Vinum Pulse catalog first."
                )

            prices = [float(w.price_eur) for w in wines]
            median_price = round(_percentile(prices, 0.50), 2)
            p35 = round(_percentile(prices, 0.35), 2)
            p65 = round(_percentile(prices, 0.65), 2)

            mid_band_wines = [w for w in wines if p35 <= float(w.price_eur) <= p65] or wines

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
                alternatives=[_wine_to_suggestion(alt, vinum_base_url) for alt in alternatives],
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
