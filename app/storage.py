from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path

import yaml

from app.models import (
    Ingredient,
    Recipe,
    UtensilCatalogItem,
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RECIPES_DIR = DATA_DIR / "recipes"
MEDIA_DIR = DATA_DIR / "media"
UTENSILS_FILE = DATA_DIR / "utensils.yaml"


def ensure_directories() -> None:
    RECIPES_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[-\s]+", "-", value).strip("-") or "receta"


def render_recipe_markdown(recipe: Recipe) -> str:
    """Genera un archivo Markdown (.md) con YAML Frontmatter completo y cuerpo legible compatible con Obsidian."""
    data = recipe.model_dump()

    frontmatter_str = yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=100,
    ).strip()

    lines: list[str] = [
        "---",
        frontmatter_str,
        "---",
        "",
        f"# {recipe.title}",
    ]

    if recipe.subtitle:
        lines.append(f"*{recipe.subtitle}*")
    lines.append("")

    # Resumen técnico
    lines.append(
        f"**Categoría:** {recipe.category} | "
        f"**Dificultad:** {'★' * recipe.difficulty}{'☆' * (5 - recipe.difficulty)} ({recipe.difficulty}/5) | "
        f"**Rendimiento:** {recipe.servings:g} {recipe.yield_unit}"
    )
    t = recipe.timings
    lines.append(
        f"**Tiempos:** Prep: {t.prep_minutes} min · Cocción: {t.cook_minutes} min · "
        f"Reposo: {t.rest_minutes} min ({t.rest_notes or 'sin notas'})"
    )
    lines.append("")

    # Utensilios
    if recipe.utensils:
        lines.append("## Utensilios y Equipamiento")
        mandatory = [u for u in recipe.utensils if u.mandatory]
        optional = [u for u in recipe.utensils if not u.mandatory]
        if mandatory:
            lines.append("### Obligatorios")
            for u in mandatory:
                note_part = f" — *{u.notes}*" if u.notes else ""
                lines.append(f"- **[OBLIGATORIO] {u.name}**{note_part}")
        if optional:
            lines.append("### Opcionales / Sustituibles")
            for u in optional:
                note_part = f" — *{u.notes}*" if u.notes else ""
                lines.append(f"- [Opcional] {u.name}{note_part}")
        lines.append("")

    # Sub-recetas vinculadas
    if recipe.subrecipes:
        lines.append("## Elaboraciones Previas (Sub-recetas)")
        for sr in recipe.subrecipes:
            amt = f"{sr.amount:g} {sr.unit}" if sr.amount is not None else sr.unit
            note_part = f" ({sr.notes})" if sr.notes else ""
            lines.append(f"- [[{sr.recipe_id}|{sr.name}]]: **{amt}**{note_part}")
        lines.append("")

    # Ingredientes
    if recipe.ingredients:
        lines.append("## Ingredientes")
        groups: dict[str, list[Ingredient]] = {}
        for ing in recipe.ingredients:
            groups.setdefault(ing.group or "Principal", []).append(ing)
        for grp_name, items in groups.items():
            if len(groups) > 1 or grp_name != "Principal":
                lines.append(f"### {grp_name}")
            for ing in items:
                amt = f"{ing.amount:g}" if ing.amount is not None else ""
                base_badge = " *(Base 100%)*" if ing.is_base_weight else ""
                note_part = f" — {ing.notes}" if ing.notes else ""
                lines.append(f"- **{amt} {ing.unit}** {ing.name}{base_badge}{note_part}".strip())
        lines.append("")

    # Temperaturas críticas
    if recipe.temperatures:
        lines.append("## Control de Temperaturas")
        for tp in recipe.temperatures:
            note_part = f" ({tp.notes})" if tp.notes else ""
            lines.append(f"- **{tp.stage}:** {tp.temp_c:g} °C{note_part}")
        lines.append("")

    # Paso a paso
    if recipe.steps:
        lines.append("## Procedimiento Paso a Paso")
        for step in sorted(recipe.steps, key=lambda s: s.order):
            header_bits = [f"{step.order}."]
            if step.title:
                header_bits.append(f"**{step.title}**")
            meta_bits = []
            if step.duration_minutes:
                meta_bits.append(f"⏱ {step.duration_minutes} min")
            if step.temp_c is not None:
                meta_bits.append(f"🌡 {step.temp_c:g} °C")
            meta_str = f" `[{' | '.join(meta_bits)}]`" if meta_bits else ""
            lines.append(f"{' '.join(header_bits)}{meta_str}")
            lines.append(f"   {step.instruction}")
            if step.critical_point:
                lines.append(f"   > **PCC / Tip:** {step.critical_point}")
            lines.append("")

    if recipe.plating_notes:
        lines.append("## Emplatado y Servicio")
        lines.append(recipe.plating_notes)
        lines.append("")

    if recipe.chef_notes:
        lines.append("## Notas Técnicas del Chef")
        lines.append(recipe.chef_notes)
        lines.append("")

    if recipe.iterations:
        lines.append("## Historial de Iteraciones (I+D)")
        for it in recipe.iterations:
            lines.append(f"- **{it.version}** ({it.date}): {it.changes}")
            if it.next_steps:
                lines.append(f"  - *Siguiente prueba:* {it.next_steps}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_recipe_markdown(filepath: Path) -> Recipe | None:
    """Lee un archivo .md con YAML Frontmatter y devuelve un objeto Recipe validado."""
    if not filepath.exists():
        return None
    content = filepath.read_text(encoding="utf-8")
    frontmatter_match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n(.*))?$", content, re.DOTALL)
    if frontmatter_match:
        yaml_text = frontmatter_match.group(1)
        body_text = (frontmatter_match.group(2) or "").strip()
        try:
            data = yaml.safe_load(yaml_text) or {}
        except Exception:
            data = {}
    else:
        data = {}
        body_text = content.strip()

    if not isinstance(data, dict):
        data = {}

    if not data.get("id"):
        data["id"] = filepath.stem
    if not data.get("title"):
        data["title"] = filepath.stem.replace("-", " ").title()
    if not data.get("chef_notes") and body_text and not frontmatter_match:
        data["chef_notes"] = body_text

    return Recipe.model_validate(data)


def list_recipes() -> list[Recipe]:
    ensure_directories()
    recipes: list[Recipe] = []
    for path in sorted(RECIPES_DIR.glob("*.md")):
        recipe = parse_recipe_markdown(path)
        if recipe:
            recipes.append(recipe)
    return recipes


def get_recipe(recipe_id: str) -> Recipe | None:
    ensure_directories()
    path = RECIPES_DIR / f"{recipe_id}.md"
    return parse_recipe_markdown(path)


def save_recipe(recipe: Recipe, previous_id: str | None = None) -> Recipe:
    ensure_directories()
    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M")
    if not recipe.id:
        base_slug = slugify(recipe.title)
        candidate = base_slug
        counter = 2
        while (RECIPES_DIR / f"{candidate}.md").exists() and candidate != previous_id:
            candidate = f"{base_slug}-{counter}"
            counter += 1
        recipe.id = candidate

    if not recipe.created_at:
        recipe.created_at = now_iso
    recipe.updated_at = now_iso

    # Ordenar pasos consecutivos
    for idx, step in enumerate(recipe.steps, start=1):
        step.order = idx

    if previous_id and previous_id != recipe.id:
        old_path = RECIPES_DIR / f"{previous_id}.md"
        if old_path.exists():
            old_path.unlink()

    target_path = RECIPES_DIR / f"{recipe.id}.md"
    md_text = render_recipe_markdown(recipe)
    target_path.write_text(md_text, encoding="utf-8")
    return recipe


def delete_recipe(recipe_id: str) -> bool:
    ensure_directories()
    target_path = RECIPES_DIR / f"{recipe_id}.md"
    if target_path.exists():
        target_path.unlink()
        return True
    return False


def load_utensils() -> list[UtensilCatalogItem]:
    ensure_directories()
    if not UTENSILS_FILE.exists():
        return []
    raw = yaml.safe_load(UTENSILS_FILE.read_text(encoding="utf-8")) or []
    return [UtensilCatalogItem.model_validate(item) for item in raw]


def save_utensils(items: list[UtensilCatalogItem]) -> list[UtensilCatalogItem]:
    ensure_directories()
    for item in items:
        if not item.id:
            item.id = slugify(item.name)
    data = [item.model_dump() for item in items]
    UTENSILS_FILE.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    return items
