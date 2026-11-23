"""FastAPI application for Mise en Place MD backed by PostgreSQL + Vinum Pulse bridge."""

from __future__ import annotations

import shutil
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text

from app.database import SessionLocal, engine, settings
from app.models import (
    DishRecipeLinkRequest,
    DishRecipeLinkResponse,
    Recipe,
    RecipeWineSuggestion,
    UtensilCatalogItem,
)
from app.repository import RecipeRepository, RecipeSortBy, SubrecipeCycleError, safe_media_filename
from app.seed import seed_initial_data
from app.storage import (
    BASE_DIR,
    MEDIA_DIR,
    RECIPES_DIR,
    ensure_directories,
    parse_recipe_markdown,
    render_recipe_markdown,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"
repository = RecipeRepository(session_factory=SessionLocal)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize directories, seed legacy markdown files if absent, and hydrate DB."""
    ensure_directories()
    seed_initial_data()
    repository.init_and_seed(db_engine=engine, import_markdown_files=True)
    yield


app = FastAPI(
    title="Atelier Culinario — Mise en Place MD",
    description=(
        "Technical Recipe & Culinary R&D Platform backed by PostgreSQL "
        "with bidirectional Vinum Pulse wine pairing."
    ),
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(SubrecipeCycleError)
async def subrecipe_cycle_exception_handler(
    _request: Request,
    exc: SubrecipeCycleError,
) -> JSONResponse:
    """Return HTTP 422 when saving recipe_subrecipes would introduce a DAG cycle."""
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc), "cycle": exc.cycle_path},
    )


class RawMarkdownPayload(BaseModel):
    """Raw Markdown + YAML frontmatter payload for import/edit."""

    content: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness and database connectivity health check."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database_backend": engine.dialect.name}


@app.get("/api/recipes", response_model=list[Recipe])
def api_list_recipes(
    q: str | None = Query(
        default=None,
        description="Full-text search query (websearch_to_tsquery in Spanish on PostgreSQL)",
    ),
    category: str | None = Query(default=None, description="Optional category filter"),
    tag: str | None = Query(default=None, description="Optional tag filter (GIN indexed)"),
    technique: str | None = Query(default=None, description="Optional technique filter"),
    utensil: str | None = Query(default=None, description="Optional utensil slug filter"),
    utensil_id: str | None = Query(default=None, description="Alias for utensil slug filter"),
    cookable: bool = Query(
        default=False,
        description="Filter to recipes whose mandatory utensils are all owned",
    ),
    is_subrecipe: bool | None = Query(
        default=None, description="Filter by sub-recipe flag (true/false)"
    ),
    ing_include: str | None = Query(
        default=None, description="Comma-separated required ingredient terms"
    ),
    ing_exclude: str | None = Query(
        default=None, description="Comma-separated excluded ingredient terms"
    ),
    sort_by: Annotated[
        RecipeSortBy | None,
        Query(
            description="Sort order: relevance, title_asc, title_desc, updated_desc, rating_desc, difficulty_asc, difficulty_desc, active_time_asc, total_time_asc",
        ),
    ] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[Recipe]:
    """Return paginated recipes with server-side FTS search, filters, and sorting."""
    return repository.list_recipes(
        q=q,
        category=category,
        tag=tag,
        technique=technique,
        utensil_id=utensil_id or utensil,
        cookable=cookable,
        is_subrecipe=is_subrecipe,
        ing_include=ing_include,
        ing_exclude=ing_exclude,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )


@app.get("/api/recipes/{recipe_id}", response_model=Recipe)
def api_get_recipe(recipe_id: str) -> Recipe:
    """Return a single recipe by slug."""
    recipe = repository.get_recipe(recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return recipe


@app.get("/api/recipes/{recipe_id}/markdown", response_class=PlainTextResponse)
def api_get_recipe_markdown(recipe_id: str) -> str:
    """Export a persisted recipe dynamically as Obsidian-compatible Markdown + YAML."""
    recipe = repository.get_recipe(recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return render_recipe_markdown(recipe)


@app.put("/api/recipes/{recipe_id}/markdown", response_model=Recipe)
def api_put_recipe_markdown(recipe_id: str, payload: RawMarkdownPayload) -> Recipe:
    """Import/update a recipe from raw Markdown + YAML frontmatter into PostgreSQL."""
    tmp_path = RECIPES_DIR / f".import-{uuid.uuid4().hex[:8]}.md"
    try:
        ensure_directories()
        tmp_path.write_text(payload.content, encoding="utf-8")
        parsed = parse_recipe_markdown(tmp_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    if parsed is None:
        raise HTTPException(status_code=400, detail="No se pudo parsear el archivo Markdown")
    if not parsed.id:
        parsed.id = recipe_id
    return repository.save_recipe(parsed, previous_slug=recipe_id)


@app.post("/api/recipes", response_model=Recipe)
def api_create_recipe(recipe: Recipe) -> Recipe:
    """Create a new technical recipe in PostgreSQL."""
    return repository.save_recipe(recipe)


@app.put("/api/recipes/{recipe_id}", response_model=Recipe)
def api_update_recipe(recipe_id: str, recipe: Recipe) -> Recipe:
    """Update an existing recipe by slug."""
    if not recipe.id:
        recipe.id = recipe_id
    return repository.save_recipe(recipe, previous_slug=recipe_id)


@app.delete("/api/recipes/{recipe_id}")
def api_delete_recipe(recipe_id: str) -> dict[str, Any]:
    """Delete a recipe by slug."""
    deleted = repository.delete_recipe(recipe_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return {"ok": True, "deleted_id": recipe_id}


@app.get("/api/recipes/{recipe_id}/wine-suggestion", response_model=RecipeWineSuggestion)
def api_get_recipe_wine_suggestion(recipe_id: str) -> RecipeWineSuggestion:
    """Suggest a mid-price wine of the dominant/most matching type from Vinum Pulse."""
    try:
        suggestion = repository.suggest_wine_for_recipe(
            slug=recipe_id,
            vinum_base_url=settings.vinum_pulse_base_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if suggestion is None:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return suggestion


@app.post("/api/pairing/links", response_model=DishRecipeLinkResponse)
def api_link_dish_to_recipe(payload: DishRecipeLinkRequest) -> DishRecipeLinkResponse:
    """Link a Vinum Pulse dish slug with a Mise en Place recipe slug."""
    try:
        return repository.link_dish_to_recipe(payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/utensils", response_model=list[UtensilCatalogItem])
def api_list_utensils() -> list[UtensilCatalogItem]:
    """List kitchen utensils catalog."""
    return repository.list_utensils()


@app.put("/api/utensils", response_model=list[UtensilCatalogItem])
def api_save_utensils(items: list[UtensilCatalogItem]) -> list[UtensilCatalogItem]:
    """Batch upsert kitchen utensils."""
    return repository.save_utensils(items)


@app.post("/api/utensils", response_model=UtensilCatalogItem)
def api_upsert_utensil(item: UtensilCatalogItem) -> UtensilCatalogItem:
    """Upsert a single utensil."""
    return repository.upsert_utensil(item)


@app.post("/api/upload")
async def api_upload_image(file: UploadFile = File(...)) -> dict[str, str]:  # noqa: B008
    """Store an uploaded recipe image safely in local media directory."""
    ensure_directories()
    safe_stem, ext = safe_media_filename(file.filename or "foto.jpg")
    unique_name = f"{safe_stem}-{uuid.uuid4().hex[:8]}{ext}"
    dest_path = MEDIA_DIR / unique_name
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/media/{unique_name}", "filename": unique_name}


@app.get("/api/info")
def api_info() -> dict[str, str]:
    """Return runtime storage and cross-app integration diagnostics."""
    return {
        "database_backend": engine.dialect.name,
        "vinum_pulse_base_url": settings.vinum_pulse_base_url,
        "recipes_dir": str(RECIPES_DIR),
        "utensils_file": str(BASE_DIR / "data" / "utensils.yaml"),
        "media_dir": str(MEDIA_DIR),
    }


ensure_directories()
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    """Serve the SPA entry point."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/recipes/{recipe_id}")
def serve_recipe_deep_link(recipe_id: str) -> FileResponse:
    """Serve SPA entry point for direct deep links coming from Vinum Pulse dishes."""
    if repository.get_recipe(recipe_id) is None:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return FileResponse(STATIC_DIR / "index.html")
