from __future__ import annotations
import shutil
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.models import Recipe, UtensilCatalogItem
from app.storage import (
    BASE_DIR,
    RECIPES_DIR,
    MEDIA_DIR,
    ensure_directories,
    list_recipes,
    get_recipe,
    save_recipe,
    delete_recipe,
    load_utensils,
    save_utensils,
    slugify,
)
from app.seed import seed_initial_data

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Atelier Culinario — Recetario Técnico Local",
    description="Gestión avanzada de recetas en Markdown + YAML para cocineros exigentes",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_directories()
    seed_initial_data()


class RawMarkdownPayload(BaseModel):
    content: str


@app.get("/api/recipes", response_model=List[Recipe])
def api_list_recipes() -> List[Recipe]:
    return list_recipes()


@app.get("/api/recipes/{recipe_id}", response_model=Recipe)
def api_get_recipe(recipe_id: str) -> Recipe:
    recipe = get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return recipe


@app.get("/api/recipes/{recipe_id}/markdown", response_class=PlainTextResponse)
def api_get_recipe_markdown(recipe_id: str) -> str:
    path = RECIPES_DIR / f"{recipe_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo Markdown no encontrado")
    return path.read_text(encoding="utf-8")


@app.put("/api/recipes/{recipe_id}/markdown", response_model=Recipe)
def api_put_recipe_markdown(recipe_id: str, payload: RawMarkdownPayload) -> Recipe:
    path = RECIPES_DIR / f"{recipe_id}.md"
    path.write_text(payload.content, encoding="utf-8")
    recipe = get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=400, detail="No se pudo parsear el archivo Markdown")
    # Re-sincronizar y normalizar
    return save_recipe(recipe, previous_id=recipe_id)


@app.post("/api/recipes", response_model=Recipe)
def api_create_recipe(recipe: Recipe) -> Recipe:
    return save_recipe(recipe)


@app.put("/api/recipes/{recipe_id}", response_model=Recipe)
def api_update_recipe(recipe_id: str, recipe: Recipe) -> Recipe:
    if not recipe.id:
        recipe.id = recipe_id
    return save_recipe(recipe, previous_id=recipe_id)


@app.delete("/api/recipes/{recipe_id}")
def api_delete_recipe(recipe_id: str) -> dict:
    deleted = delete_recipe(recipe_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return {"ok": True, "deleted_id": recipe_id}


@app.get("/api/utensils", response_model=List[UtensilCatalogItem])
def api_list_utensils() -> List[UtensilCatalogItem]:
    return load_utensils()


@app.put("/api/utensils", response_model=List[UtensilCatalogItem])
def api_save_utensils(items: List[UtensilCatalogItem]) -> List[UtensilCatalogItem]:
    return save_utensils(items)


@app.post("/api/utensils", response_model=UtensilCatalogItem)
def api_upsert_utensil(item: UtensilCatalogItem) -> UtensilCatalogItem:
    items = load_utensils()
    if not item.id:
        item.id = slugify(item.name)
    replaced = False
    for idx, existing in enumerate(items):
        if existing.id == item.id:
            items[idx] = item
            replaced = True
            break
    if not replaced:
        items.append(item)
    save_utensils(items)
    return item


@app.post("/api/upload")
async def api_upload_image(file: UploadFile = File(...)) -> dict:
    ensure_directories()
    ext = Path(file.filename or "image.jpg").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        ext = ".jpg"
    safe_stem = slugify(Path(file.filename or "foto").stem)[:40]
    unique_name = f"{safe_stem}-{uuid.uuid4().hex[:8]}{ext}"
    dest_path = MEDIA_DIR / unique_name
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/media/{unique_name}", "filename": unique_name}


@app.get("/api/info")
def api_info() -> dict:
    return {
        "recipes_dir": str(RECIPES_DIR),
        "utensils_file": str(BASE_DIR / "data" / "utensils.yaml"),
        "media_dir": str(MEDIA_DIR),
    }


ensure_directories()
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
