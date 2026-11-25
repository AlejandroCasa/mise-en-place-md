"""Food costing and combined menu + wine per-serving economics helpers."""

from __future__ import annotations

from app.models import Ingredient, Recipe, RecipeCostSummary

_UNIT_DIVISORS: dict[str, float] = {"g": 1000.0, "gr": 1000.0, "ml": 1000.0, "cl": 100.0}


def compute_ingredient_cost(ingredient: Ingredient, scale_factor: float = 1.0) -> float | None:
    """Calculate EUR cost for a single ingredient using normalized purchase-unit pricing.

    unit_cost_eur represents €/kg (for g/kg), €/l (for ml/l), or €/unit (for ud/pcs/etc.).
    """
    if ingredient.unit_cost_eur is None or ingredient.amount is None:
        return None
    divisor = _UNIT_DIVISORS.get((ingredient.unit or "").strip().lower(), 1.0)
    qty = (float(ingredient.amount) * scale_factor) / divisor
    return round(qty * float(ingredient.unit_cost_eur), 4)


def compute_recipe_food_cost(recipe: Recipe, scale_factor: float = 1.0) -> tuple[float | None, int]:
    """Sum priced ingredients for a recipe at the requested scale factor."""
    costs = [
        c
        for ing in recipe.ingredients
        if (c := compute_ingredient_cost(ing, scale_factor=scale_factor)) is not None
    ]
    if not costs:
        return None, 0
    return round(sum(costs), 2), len(costs)


def build_recipe_cost_summary(
    recipe: Recipe,
    paired_wine_price_eur: float | None = None,
) -> RecipeCostSummary:
    """Build complete food + paired wine cost breakdown per guest."""
    total_food_cost, priced_count = compute_recipe_food_cost(recipe, scale_factor=1.0)
    servings = float(recipe.servings) if recipe.servings > 0 else 1.0

    food_per_serving = round(total_food_cost / servings, 2) if total_food_cost is not None else None
    wine_per_serving = (
        round(paired_wine_price_eur / servings, 2) if paired_wine_price_eur is not None else None
    )

    total_per_guest: float | None = None
    if food_per_serving is not None or wine_per_serving is not None:
        total_per_guest = round((food_per_serving or 0.0) + (wine_per_serving or 0.0), 2)

    return RecipeCostSummary(
        recipe_slug=recipe.id,
        servings=servings,
        priced_ingredients=priced_count,
        total_ingredients=len(recipe.ingredients),
        total_food_cost_eur=total_food_cost,
        food_cost_per_serving_eur=food_per_serving,
        paired_wine_price_eur=paired_wine_price_eur,
        paired_wine_per_serving_eur=wine_per_serving,
        total_cost_per_guest_eur=total_per_guest,
    )
