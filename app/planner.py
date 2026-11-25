"""Multi-course dinner service planner with sub-recipe DAG explosion & reverse countdown."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy.orm import Session

from app.costing import compute_ingredient_cost, compute_recipe_food_cost
from app.models import (
    MenuCourseSummary,
    MenuPlanRequest,
    MenuPlanResponse,
    MenuTimelineStep,
    Recipe,
    RecipeWineSuggestion,
    ShoppingListItem,
    WineSuggestionItem,
)


class PlannerRepository(Protocol):
    """Repository interface consumed by the multi-course menu planner."""

    def get_recipe(self, slug: str) -> Recipe | None: ...

    def suggest_wine_for_recipe(
        self,
        slug: str,
        vinum_base_url: str,
    ) -> RecipeWineSuggestion | None: ...


@dataclass
class _ShoppingBucket:
    name: str
    unit: str
    total_amount: float | None = None
    sources: set[str] = field(default_factory=set)
    estimated_cost: float | None = None


def _subtract_clock_minutes(service_time: str, offset_minutes: int) -> str:
    """Return HH:MM clock time obtained by subtracting offset_minutes from service_time."""
    hh_str, mm_str = service_time.split(":")
    base_minutes = int(hh_str) * 60 + int(mm_str)
    target = (base_minutes - offset_minutes) % (24 * 60)
    return f"{target // 60:02d}:{target % 60:02d}"


def _normalize_qty_and_unit(amount: float | None, unit: str) -> tuple[float | None, str]:
    """Normalize g/kg and ml/l units cleanly so shopping list rows aggregate seamlessly."""
    clean_unit = (unit or "").strip().lower() or "ud"
    if amount is None:
        return None, clean_unit
    if clean_unit == "kg":
        return amount * 1000.0, "g"
    if clean_unit == "l":
        return amount * 1000.0, "ml"
    return amount, clean_unit


def _format_display_qty(amount: float | None, unit: str) -> tuple[float | None, str]:
    """Convert large gram/ml totals back to kg/l when >= 1000."""
    if amount is None:
        return None, unit
    if unit == "g" and amount >= 1000.0:
        return round(amount / 1000.0, 2), "kg"
    if unit == "ml" and amount >= 1000.0:
        return round(amount / 1000.0, 2), "l"
    return round(amount, 2), unit


def _accumulate_recipe_ingredients(
    recipe: Recipe,
    scale_factor: float,
    buckets: dict[tuple[str, str], _ShoppingBucket],
) -> None:
    """Aggregate scaled ingredients and costs from a single recipe into shopping buckets."""
    for ing in recipe.ingredients:
        raw_amt = float(ing.amount) * scale_factor if ing.amount is not None else None
        norm_amt, norm_unit = _normalize_qty_and_unit(raw_amt, ing.unit)
        key = (ing.name.strip().lower(), norm_unit)
        bucket = buckets.setdefault(key, _ShoppingBucket(name=ing.name.strip(), unit=norm_unit))
        bucket.sources.add(recipe.title)
        if norm_amt is not None:
            bucket.total_amount = (bucket.total_amount or 0.0) + norm_amt
        item_cost = compute_ingredient_cost(ing, scale_factor=scale_factor)
        if item_cost is not None:
            bucket.estimated_cost = (bucket.estimated_cost or 0.0) + item_cost


def _compute_child_scale(child: Recipe, sr_amount: float | None, parent_scale: float) -> float:
    """Compute scaling factor for a linked sub-recipe."""
    if sr_amount is None or child.servings <= 0:
        return parent_scale
    if child.yield_unit.strip().lower() in {"g", "ml"} and child.servings >= 100:
        return (float(sr_amount) * parent_scale) / float(child.servings)
    return parent_scale


def _explode_recipe_dag(
    repo: PlannerRepository,
    recipe: Recipe,
    scale_factor: float,
    buckets: dict[tuple[str, str], _ShoppingBucket],
    subrecipe_titles: list[str],
    timeline_steps: list[MenuTimelineStep],
    service_time: str,
    visited: set[str],
    is_root: bool,
) -> None:
    """Recursively collect scaled ingredients and sub-recipe prep steps across the DAG."""
    if recipe.id in visited:
        return
    visited.add(recipe.id)
    _accumulate_recipe_ingredients(recipe, scale_factor, buckets)

    if not is_root:
        subrecipe_titles.append(recipe.title)
        prep = recipe.timings.prep_minutes + recipe.timings.cook_minutes
        rest = recipe.timings.rest_minutes
        total_offset = prep + rest + 30
        if total_offset > 30:
            timeline_steps.append(
                MenuTimelineStep(
                    offset_minutes=total_offset,
                    clock_time=_subtract_clock_minutes(service_time, total_offset),
                    kind="subrecipe",
                    title=f"Elaboración base: {recipe.title}",
                    detail=f"Prep/cocción {prep} min" + (f" + reposo {rest} min" if rest else ""),
                    course_title=recipe.title,
                )
            )

    for sr in recipe.subrecipes:
        child = repo.get_recipe(sr.recipe_id)
        if child is None:
            continue
        _explode_recipe_dag(
            repo=repo,
            recipe=child,
            scale_factor=_compute_child_scale(child, sr.amount, scale_factor),
            buckets=buckets,
            subrecipe_titles=subrecipe_titles,
            timeline_steps=timeline_steps,
            service_time=service_time,
            visited=visited,
            is_root=False,
        )


def _append_wine_timeline(
    recipe_title: str,
    wine: WineSuggestionItem | None,
    course_lag: int,
    service_time: str,
    timeline_steps: list[MenuTimelineStep],
) -> None:
    """Append optimal wine decanting or chilling milestones before service."""
    if wine is None:
        return
    if wine.decant_minutes > 0:
        decant_offset = max(10, wine.decant_minutes - course_lag)
        timeline_steps.append(
            MenuTimelineStep(
                offset_minutes=decant_offset,
                clock_time=_subtract_clock_minutes(service_time, decant_offset),
                kind="wine_decant",
                title=f"Decantar {wine.name}",
                detail=f"Abrir/decantar {wine.decant_minutes} min antes; servir a {wine.serving_temp_c:.1f} °C ({wine.glass_type}).",
                course_title=recipe_title,
            )
        )
    elif wine.serving_temp_c <= 12.0:
        chill_offset = max(20, 45 - course_lag)
        timeline_steps.append(
            MenuTimelineStep(
                offset_minutes=chill_offset,
                clock_time=_subtract_clock_minutes(service_time, chill_offset),
                kind="wine_chill",
                title=f"Enfriar {wine.name}",
                detail=f"Llevar a {wine.serving_temp_c:.1f} °C en cubitera/nevera ({wine.glass_type}).",
                course_title=recipe_title,
            )
        )


def _append_course_timeline(
    recipe: Recipe,
    wine: WineSuggestionItem | None,
    course_idx: int,
    service_time: str,
    timeline_steps: list[MenuTimelineStep],
) -> None:
    """Append rest, prep, cook, and wine decant/chill reverse countdown milestones."""
    prep = int(recipe.timings.prep_minutes or 0)
    cook = int(recipe.timings.cook_minutes or 0)
    rest = int(recipe.timings.rest_minutes or 0)
    course_lag = max(0, (course_idx - 1) * 15)

    if rest > 0:
        rest_offset = max(rest + cook + prep - course_lag, 15)
        timeline_steps.append(
            MenuTimelineStep(
                offset_minutes=rest_offset,
                clock_time=_subtract_clock_minutes(service_time, rest_offset),
                kind="rest",
                title=f"Reposo / marinado · {recipe.title}",
                detail=recipe.timings.rest_notes or f"{rest} min de reposo técnico.",
                course_title=recipe.title,
            )
        )
    if prep > 0:
        prep_offset = max(10, prep + cook - course_lag)
        timeline_steps.append(
            MenuTimelineStep(
                offset_minutes=prep_offset,
                clock_time=_subtract_clock_minutes(service_time, prep_offset),
                kind="prep",
                title=f"Mise en place · {recipe.title}",
                detail=f"Preparación activa ({prep} min).",
                course_title=recipe.title,
            )
        )
    if cook > 0:
        cook_offset = max(5, cook - course_lag)
        timeline_steps.append(
            MenuTimelineStep(
                offset_minutes=cook_offset,
                clock_time=_subtract_clock_minutes(service_time, cook_offset),
                kind="cook",
                title=f"Cocción al pase · {recipe.title}",
                detail=f"Cocción activa ({cook} min).",
                course_title=recipe.title,
            )
        )
    _append_wine_timeline(recipe.title, wine, course_lag, service_time, timeline_steps)


def _build_shopping_list(buckets: dict[tuple[str, str], _ShoppingBucket]) -> list[ShoppingListItem]:
    """Convert aggregated ingredient buckets into sorted ShoppingListItem contracts."""
    items: list[ShoppingListItem] = []
    for bucket in sorted(buckets.values(), key=lambda b: b.name.lower()):
        disp_amt, disp_unit = _format_display_qty(bucket.total_amount, bucket.unit)
        items.append(
            ShoppingListItem(
                name=bucket.name,
                total_amount=disp_amt,
                unit=disp_unit,
                sources=sorted(bucket.sources),
                estimated_cost_eur=(
                    round(bucket.estimated_cost, 2) if bucket.estimated_cost is not None else None
                ),
            )
        )
    return items


def _resolve_course_wine(
    repo: PlannerRepository,
    recipe_slug: str,
    vinum_base_url: str,
) -> WineSuggestionItem | None:
    """Resolve optional wine recommendation for a course without failing if catalog is empty."""
    try:
        suggestion = repo.suggest_wine_for_recipe(recipe_slug, vinum_base_url)
    except ValueError:
        return None
    return suggestion.recommended_wine if suggestion is not None else None


def _summarize_menu_totals(
    courses_input: list[MenuCourseSummary],
    seen_wines: dict[str, float],
    total_food_cost: float,
    any_food_cost: bool,
) -> tuple[float, float | None, float | None, float | None, float | None]:
    """Compute guest count, food total, wine total, combined total, and cost per guest."""
    guest_count = max(float(c.servings) for c in courses_input)
    total_wine_cost = round(sum(seen_wines.values()), 2) if seen_wines else None
    food_total = round(total_food_cost, 2) if any_food_cost else None
    has_any = food_total is not None or total_wine_cost is not None
    combined_total = round((food_total or 0.0) + (total_wine_cost or 0.0), 2) if has_any else None
    cost_per_guest = (
        round(combined_total / guest_count, 2)
        if combined_total is not None and guest_count > 0
        else None
    )
    return guest_count, food_total, total_wine_cost, combined_total, cost_per_guest


def _plan_single_course(
    idx: int,
    recipe_slug: str,
    servings: float,
    repo: PlannerRepository,
    service_time: str,
    buckets: dict[tuple[str, str], _ShoppingBucket],
    timeline_steps: list[MenuTimelineStep],
    vinum_base_url: str,
) -> tuple[MenuCourseSummary, float | None, WineSuggestionItem | None]:
    """Plan one course: explode DAG, compute food cost, resolve wine, and add timeline steps."""
    recipe = repo.get_recipe(recipe_slug)
    if recipe is None:
        raise ValueError(f"Receta '{recipe_slug}' no encontrada.")

    scale_factor = float(servings) / (float(recipe.servings) if recipe.servings > 0 else 1.0)
    subrecipes_used: list[str] = []
    _explode_recipe_dag(
        repo,
        recipe,
        scale_factor,
        buckets,
        subrecipes_used,
        timeline_steps,
        service_time,
        set(),
        True,
    )
    course_food_cost, priced = compute_recipe_food_cost(recipe, scale_factor=scale_factor)
    wine = _resolve_course_wine(repo, recipe.id, vinum_base_url)
    _append_course_timeline(recipe, wine, idx, service_time, timeline_steps)
    summary = MenuCourseSummary(
        course_number=idx,
        recipe_slug=recipe.id,
        recipe_title=recipe.title,
        category=recipe.category,
        servings=servings,
        food_cost_eur=course_food_cost if priced > 0 else None,
        wine=wine,
        subrecipes_used=sorted(set(subrecipes_used)),
    )
    return summary, (course_food_cost if priced > 0 else None), wine


def build_multi_course_plan(
    _session: Session,
    repo: PlannerRepository,
    payload: MenuPlanRequest,
    vinum_base_url: str,
) -> MenuPlanResponse:
    """Build a multi-course dinner plan with exploded shopping list, reverse timeline & costing."""
    buckets: dict[tuple[str, str], _ShoppingBucket] = {}
    timeline_steps: list[MenuTimelineStep] = []
    courses_out: list[MenuCourseSummary] = []

    total_food_cost = 0.0
    any_food_cost = False
    seen_wines: dict[str, float] = {}

    for idx, item in enumerate(payload.courses, start=1):
        summary, course_food_cost, wine = _plan_single_course(
            idx,
            item.recipe_slug,
            item.servings,
            repo,
            payload.service_time,
            buckets,
            timeline_steps,
            vinum_base_url,
        )
        courses_out.append(summary)
        if course_food_cost is not None:
            total_food_cost += course_food_cost
            any_food_cost = True
        if wine is not None:
            seen_wines[wine.slug] = wine.price_eur

    timeline_steps.append(
        MenuTimelineStep(
            offset_minutes=0,
            clock_time=payload.service_time,
            kind="service",
            title="Inicio de Pase en Mesa",
            detail=f"Servicio coordinado de {len(courses_out)} pases.",
            course_title="",
        )
    )
    timeline_steps.sort(key=lambda s: (-s.offset_minutes, s.title))

    guest_count, food_total, total_wine_cost, combined_total, cost_per_guest = (
        _summarize_menu_totals(courses_out, seen_wines, total_food_cost, any_food_cost)
    )

    return MenuPlanResponse(
        service_time=payload.service_time,
        guest_count=guest_count,
        courses=courses_out,
        shopping_list=_build_shopping_list(buckets),
        timeline=timeline_steps,
        total_food_cost_eur=food_total,
        total_wine_cost_eur=total_wine_cost,
        total_menu_cost_eur=combined_total,
        cost_per_guest_eur=cost_per_guest,
    )
