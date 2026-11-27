"""Deterministic Quick-Capture parser converting raw text/notes into a technical Recipe draft."""

from __future__ import annotations

import re

from app.models import Ingredient, Recipe, RecipeStep, Timings
from app.storage import slugify

_ING_RE = re.compile(
    r"^(?:[-*•]\s*)?(?P<amount>\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>kg|gr|g|ml|cl|l|ud|uds|cda|cdta|pizca)?\s+"
    r"(?:de\s+)?(?P<name>.+)$",
    re.IGNORECASE,
)
_STEP_RE = re.compile(r"^(?:\d+[.)]\s*|[-*•]\s*)(?P<text>.+)$")
_TIME_RE = re.compile(r"(\d+)\s*(?:min|minutos|m)\b", re.IGNORECASE)
_TEMP_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*°\s*[cC]?")


def _parse_ingredient_line(line: str) -> Ingredient:
    """Parse a single freeform ingredient bullet into an Ingredient model."""
    cleaned = line.strip().lstrip("-*•").strip()
    match = _ING_RE.match(cleaned)
    if match:
        amount = float(match.group("amount").replace(",", "."))
        unit = (match.group("unit") or "ud").lower()
        if unit == "uds":
            unit = "ud"
        elif unit == "gr":
            unit = "g"
        name = match.group("name").strip()
        return Ingredient(name=name, amount=amount, unit=unit)
    return Ingredient(name=cleaned, amount=None, unit="al gusto")


def _detect_section(line_lower: str) -> str | None:
    """Detect whether a heading line introduces ingredients, steps, or notes."""
    clean = line_lower.lstrip("#").strip().rstrip(":")
    if any(k in clean for k in ("ingrediente", "escandallo", "mise en place")):
        return "ingredients"
    if any(k in clean for k in ("paso", "procedimiento", "elaboración", "preparación")):
        return "steps"
    if any(k in clean for k in ("nota", "observación", "emplatado")):
        return "notes"
    return None


def _build_step_from_line(order: int, line: str) -> RecipeStep:
    """Create a RecipeStep extracting optional duration and temperature tokens."""
    step_match = _STEP_RE.match(line)
    instruction = step_match.group("text").strip() if step_match else line
    dur_match = _TIME_RE.search(instruction)
    temp_match = _TEMP_RE.search(instruction)
    return RecipeStep(
        order=order,
        title=f"Paso {order}",
        instruction=instruction,
        duration_minutes=int(dur_match.group(1)) if dur_match else None,
        temp_c=float(temp_match.group(1).replace(",", ".")) if temp_match else None,
    )


def _append_classified_line(
    line: str,
    section: str,
    ingredients: list[Ingredient],
    steps: list[RecipeStep],
    notes_lines: list[str],
    subtitle: str,
) -> str:
    """Route a non-heading capture line into ingredients, steps, subtitle, or chef notes."""
    if section == "ingredients" or (section == "auto" and _ING_RE.match(line)):
        ingredients.append(_parse_ingredient_line(line))
        return subtitle
    if section == "steps" or (section == "auto" and re.match(r"^\d+[.)]\s+", line)):
        steps.append(_build_step_from_line(len(steps) + 1, line))
        return subtitle
    if not subtitle and not line.startswith(("-", "*", "•")):
        return line
    notes_lines.append(line.lstrip("-*•").strip())
    return subtitle


def _build_capture_recipe(
    title: str,
    subtitle: str,
    default_category: str,
    tags: list[str],
    ingredients: list[Ingredient],
    steps: list[RecipeStep],
    notes_lines: list[str],
) -> Recipe:
    """Assemble validated Recipe draft with sensible fallback ingredient/step."""
    final_ingredients = ingredients or [
        Ingredient(name="Ingrediente principal", amount=100.0, unit="g")
    ]
    final_steps = steps or [
        RecipeStep(
            order=1,
            title="Elaboración",
            instruction="Completar procedimiento técnico en el editor.",
        )
    ]
    return Recipe(
        id=slugify(title),
        title=title,
        subtitle=subtitle or "Capturado desde Inbox Rápido",
        category=default_category or "Principal",
        tags=sorted(set(tags)),
        timings=Timings(
            prep_minutes=15,
            cook_minutes=sum(s.duration_minutes or 0 for s in final_steps),
            rest_minutes=0,
        ),
        ingredients=final_ingredients,
        steps=final_steps,
        chef_notes="\n".join(notes_lines),
    )


def parse_quick_capture_text(raw_text: str, default_category: str = "Principal") -> Recipe:
    """Convert raw Spanish/English culinary text or minimal Markdown into a draft Recipe."""
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    title = "Borrador Rápido"
    subtitle = ""
    tags: list[str] = []
    ingredients: list[Ingredient] = []
    steps: list[RecipeStep] = []
    notes_lines: list[str] = []
    section = "auto"

    for idx, line in enumerate(lines):
        if idx == 0 and not line.startswith(("-", "*", "•", "1.")):
            title = line.lstrip("#").strip()
            continue
        detected = _detect_section(line.lower())
        if detected is not None:
            section = detected
            continue
        tags.extend(re.findall(r"#([\w-]+)", line))
        subtitle = _append_classified_line(line, section, ingredients, steps, notes_lines, subtitle)

    return _build_capture_recipe(
        title, subtitle, default_category, tags, ingredients, steps, notes_lines
    )
