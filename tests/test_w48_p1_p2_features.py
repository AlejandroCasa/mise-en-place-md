"""Tests for Sprint 2026-W48 P1 & P2 features in Mise en Place MD."""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

import app.main as main_module
from alembic import command
from app.database import create_db_engine, settings
from app.db_models import CellarItemRecord, DishRecord, WineRecord
from app.observability import JsonLogFormatter
from app.repository import RecipeRepository


@pytest.fixture()
def full_client(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[tuple[TestClient, Path, Path]]:
    """Provide an isolated TestClient with seeded wines, dishes, cellar items, and temp media."""
    test_engine = create_db_engine("sqlite:///:memory:")
    test_session_local = sessionmaker(
        bind=test_engine,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
    )
    test_repo = RecipeRepository(session_factory=test_session_local)
    test_repo.init_and_seed(db_engine=test_engine, import_markdown_files=False)

    with test_session_local() as session:
        session.add_all(
            [
                WineRecord(
                    slug="ribera-crianza-medio",
                    name="Ribera Crianza Medio",
                    winery="Bodega Dos",
                    appellation="D.O. Ribera del Duero",
                    country="España",
                    classification="D.O.",
                    wine_type="Red",
                    vintage=2021,
                    price_eur=Decimal("24.00"),
                    serving_temp_c=Decimal("16.5"),
                    decant_minutes=20,
                    glass_type="Burdeos",
                    body=Decimal("8.50"),
                    acidity=Decimal("6.50"),
                    tannins=Decimal("7.50"),
                    fruit=Decimal("8.00"),
                    oak=Decimal("7.50"),
                    tasting_notes="Mora, cacao y especias",
                    tagline="Equilibrio de precio medio",
                ),
                WineRecord(
                    slug="rias-baixas-albarino",
                    name="Albariño Sobre Lías",
                    winery="Bodega Cinco",
                    appellation="D.O. Rías Baixas",
                    country="España",
                    classification="D.O.",
                    wine_type="White",
                    vintage=2023,
                    price_eur=Decimal("19.00"),
                    serving_temp_c=Decimal("9.0"),
                    decant_minutes=0,
                    glass_type="Borgoña",
                    body=Decimal("6.50"),
                    acidity=Decimal("8.50"),
                    tannins=Decimal("1.50"),
                    fruit=Decimal("8.50"),
                    oak=Decimal("2.50"),
                    tasting_notes="Salino y cítrico",
                    tagline="Atlántico",
                ),
                CellarItemRecord(
                    id="cellar-1",
                    user_id="sommelier",
                    wine_slug="ribera-crianza-medio",
                    quantity=3,
                    purchase_price_eur=Decimal("22.00"),
                    storage_location="Estante A2",
                    notes="Listo para abrir",
                ),
                CellarItemRecord(
                    id="cellar-2",
                    user_id="sommelier",
                    wine_slug="rias-baixas-albarino",
                    quantity=2,
                    purchase_price_eur=Decimal("18.50"),
                    storage_location="Vinoteca B1",
                    notes="Servir frío",
                ),
                DishRecord(
                    slug="carrillera-iberica-estofada",
                    name="Carrillera Ibérica Estofada",
                    category="Carnes y Caza",
                    description="Carrillera melosa",
                    body=Decimal("8.50"),
                    acidity=Decimal("6.50"),
                    tannins=Decimal("7.50"),
                    fruit=Decimal("8.00"),
                    oak=Decimal("7.50"),
                    suggested_wine_type="Red",
                ),
            ]
        )
        session.commit()

    media_dir = tmp_path / "media"
    recipes_dir = tmp_path / "recipes"
    media_dir.mkdir(parents=True, exist_ok=True)
    recipes_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(main_module, "engine", test_engine)
    monkeypatch.setattr(main_module, "SessionLocal", test_session_local)
    monkeypatch.setattr(main_module, "repository", test_repo)
    monkeypatch.setattr("app.main.MEDIA_DIR", media_dir)
    monkeypatch.setattr("app.main.RECIPES_DIR", recipes_dir)

    with TestClient(main_module.app) as client:
        yield client, media_dir, recipes_dir


def _make_jpeg_with_exif() -> bytes:
    """Create a valid in-memory JPEG containing synthetic EXIF orientation/artist tags."""
    img = Image.new("RGB", (32, 32), color=(180, 40, 40))
    exif = Image.Exif()
    exif[0x013B] = "SecretChefCamera"  # Artist tag
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


def test_upload_hardening_strips_exif_converts_webp_and_rejects_spoof(
    full_client: tuple[TestClient, Path, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Upload validates magic bytes & max size, strips EXIF, and converts to WebP."""
    client, media_dir, _ = full_client
    raw_jpg = _make_jpeg_with_exif()
    ok_resp = client.post(
        "/api/upload",
        files={"file": ("plato_con_exif.jpg", raw_jpg, "image/jpeg")},
    )
    assert ok_resp.status_code == 200
    body = ok_resp.json()
    assert body["filename"].endswith(".webp")
    assert body["mime_type"] == "image/webp"

    stored_path = media_dir / body["filename"]
    assert stored_path.exists()
    with Image.open(stored_path) as out_img:
        assert out_img.format == "WEBP"
        assert len(out_img.getexif()) == 0
        assert "exif" not in out_img.info

    # Reject disguised HTML payload claiming image/jpeg
    bad_mime = client.post(
        "/api/upload",
        files={"file": ("evil.jpg", b"<html><script>alert(1)</script></html>", "image/jpeg")},
    )
    assert bad_mime.status_code == 415

    # Reject empty upload
    empty_resp = client.post(
        "/api/upload",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert empty_resp.status_code == 400

    # Reject oversized payload with 413
    monkeypatch.setattr(settings, "max_upload_bytes", 128)
    too_big = client.post(
        "/api/upload",
        files={"file": ("big.jpg", raw_jpg, "image/jpeg")},
    )
    assert too_big.status_code == 413


def test_in_memory_markdown_import_and_json_request_id_logging(
    full_client: tuple[TestClient, Path, Path],
) -> None:
    """PUT /markdown parses in memory without temp files and emits X-Request-ID JSON logs."""
    client, _, recipes_dir = full_client
    md_text = """---
id: test-memoria
title: Caldo Dashi Exprés
category: Fondo / Base
servings: 2
ingredients:
  - name: Alga kombu
    amount: 20
    unit: g
steps:
  - order: 1
    title: Infusión
    instruction: Infusionar 15 min a 60 °C.
---
# Caldo Dashi Exprés
"""
    resp = client.put(
        "/api/recipes/test-memoria/markdown",
        json={"content": md_text},
        headers={"X-Request-ID": "trace-w48-01"},
    )
    assert resp.status_code == 200
    assert resp.headers["X-Request-ID"] == "trace-w48-01"
    assert resp.json()["title"] == "Caldo Dashi Exprés"
    assert list(recipes_dir.glob(".import-*")) == []

    # Invalid YAML frontmatter yields HTTP 400
    bad_md = client.put(
        "/api/recipes/test-memoria/markdown",
        json={"content": "---\ntitle: [unclosed\n---\n"},
    )
    assert bad_md.status_code == 400

    # Verify JsonLogFormatter produces valid single-line JSON with request_id
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="mise_en_place",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="Structured test",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-abc"
    parsed = json.loads(formatter.format(record))
    assert parsed["request_id"] == "req-abc"
    assert parsed["message"] == "Structured test"


def test_cellar_live_match_and_reverse_bottle_to_recipes(
    full_client: tuple[TestClient, Path, Path],
) -> None:
    """Wine suggestions reflect cellar stock and reverse endpoint ranks compatible recipes."""
    client, _, _ = full_client
    meat_recipe: dict[str, Any] = {
        "id": "solomillo-setas",
        "title": "Solomillo con Setas y Fondo Oscuro",
        "category": "Carnes y Caza",
        "servings": 2,
        "tags": ["carrillera", "setas", "fondo-oscuro"],
        "ingredients": [
            {"name": "Solomillo de ternera", "amount": 400, "unit": "g", "unit_cost_eur": 32.0}
        ],
        "steps": [{"order": 1, "title": "Plancha", "instruction": "Sellar a fuego vivo."}],
    }
    fish_recipe: dict[str, Any] = {
        "id": "lubina-al-vapor",
        "title": "Lubina al Vapor con Hinojo",
        "category": "Pescados y Mariscos",
        "servings": 2,
        "tags": ["lubina", "pescado"],
        "ingredients": [{"name": "Lubina salvaje", "amount": 500, "unit": "g"}],
        "steps": [{"order": 1, "title": "Vapor", "instruction": "Cocer 8 min."}],
    }
    assert client.post("/api/recipes", json=meat_recipe).status_code == 200
    assert client.post("/api/recipes", json=fish_recipe).status_code == 200

    suggestion = client.get("/api/recipes/solomillo-setas/wine-suggestion")
    assert suggestion.status_code == 200
    s_data = suggestion.json()
    assert s_data["recommended_wine"]["slug"] == "ribera-crianza-medio"
    assert s_data["recommended_wine"]["cellar_quantity"] == 3
    assert s_data["cellar_available_count"] >= 3
    assert any(m["slug"] == "ribera-crianza-medio" for m in s_data["cellar_matches"])

    # List cellar bottles
    bottles = client.get("/api/cellar/bottles")
    assert bottles.status_code == 200
    assert len(bottles.json()) == 2

    # Reverse match for Red cellar bottle includes meat recipe in top 12 with high score
    rev_red = client.get("/api/cellar/bottles/ribera-crianza-medio/recipes")
    assert rev_red.status_code == 200
    red_matches = rev_red.json()["matches"]
    red_by_slug = {m["recipe_slug"]: m for m in red_matches}
    assert "solomillo-setas" in red_by_slug
    assert red_by_slug["solomillo-setas"]["compatibility_score"] >= 80.0
    if "lubina-al-vapor" in red_by_slug:
        assert (
            red_by_slug["solomillo-setas"]["compatibility_score"]
            > red_by_slug["lubina-al-vapor"]["compatibility_score"]
        )

    # Reverse match for White cellar bottle includes fish recipe in top 12 with high score
    rev_white = client.get("/api/cellar/bottles/rias-baixas-albarino/recipes")
    assert rev_white.status_code == 200
    white_matches = rev_white.json()["matches"]
    white_by_slug = {m["recipe_slug"]: m for m in white_matches}
    assert "lubina-al-vapor" in white_by_slug
    assert white_by_slug["lubina-al-vapor"]["compatibility_score"] >= 80.0

    missing = client.get("/api/cellar/bottles/no-existe-vino/recipes")
    assert missing.status_code == 404


def test_multi_course_menu_planner_dag_explosion_costing_and_iterations(
    full_client: tuple[TestClient, Path, Path],
) -> None:
    """Multi-course planner explodes sub-recipe DAG, builds decant timeline & food+wine costs."""
    client, _, _ = full_client
    sub_recipe: dict[str, Any] = {
        "id": "fondo-base-menu",
        "title": "Fondo Base de Carne",
        "category": "Fondo / Base",
        "is_subrecipe": True,
        "servings": 1000,
        "yield_unit": "ml",
        "timings": {"prep_minutes": 15, "cook_minutes": 90, "rest_minutes": 0},
        "ingredients": [
            {"name": "Huesos de ternera", "amount": 1000, "unit": "g", "unit_cost_eur": 4.0},
            {"name": "Ajo morado", "amount": 30, "unit": "g", "unit_cost_eur": 6.0},
        ],
        "steps": [{"order": 1, "title": "Tostado", "instruction": "Asar huesos."}],
    }
    main_one: dict[str, Any] = {
        "id": "arroz-pato-menu",
        "title": "Arroz de Pato y Setas",
        "category": "Arroces",
        "servings": 4,
        "tags": ["carrillera", "setas"],
        "timings": {"prep_minutes": 20, "cook_minutes": 25, "rest_minutes": 15},
        "subrecipes": [
            {"recipe_id": "fondo-base-menu", "name": "Fondo Base", "amount": 500, "unit": "ml"}
        ],
        "ingredients": [
            {"name": "Arroz bomba", "amount": 400, "unit": "g", "unit_cost_eur": 5.0},
            {"name": "Ajo morado", "amount": 20, "unit": "g", "unit_cost_eur": 6.0},
        ],
        "steps": [{"order": 1, "title": "Sofrito", "instruction": "Sofreír ajo y arroz."}],
        "iterations": [
            {
                "version": "v1.0",
                "date": "2026-11-20",
                "changes": "Primera prueba con caldo corto",
                "next_steps": "Subir fondo 10%",
                "photo": "/media/v1.webp",
                "metrics": {"punto": "al dente"},
            }
        ],
    }
    main_two: dict[str, Any] = {
        "id": "merluza-verde-menu",
        "title": "Merluza en Salsa Verde",
        "category": "Pescados y Mariscos",
        "servings": 4,
        "tags": ["pescado", "marisco"],
        "timings": {"prep_minutes": 15, "cook_minutes": 12, "rest_minutes": 0},
        "ingredients": [
            {"name": "Merluza de pincho", "amount": 800, "unit": "g", "unit_cost_eur": 18.0},
            {"name": "Ajo morado", "amount": 20, "unit": "g", "unit_cost_eur": 6.0},
        ],
        "steps": [{"order": 1, "title": "Pilpil", "instruction": "Ligar salsa verde."}],
    }

    assert client.post("/api/recipes", json=sub_recipe).status_code == 200
    assert client.post("/api/recipes", json=main_one).status_code == 200
    assert client.post("/api/recipes", json=main_two).status_code == 200

    # Check recipe costing endpoint (food + paired wine)
    cost_resp = client.get("/api/recipes/arroz-pato-menu/cost")
    assert cost_resp.status_code == 200
    c_data = cost_resp.json()
    assert c_data["total_food_cost_eur"] == pytest.approx(2.12, abs=0.02)
    assert c_data["paired_wine_price_eur"] == 24.0
    assert c_data["total_cost_per_guest_eur"] is not None

    # Check multi-course menu plan
    plan_resp = client.post(
        "/api/menu-plan",
        json={
            "service_time": "21:30",
            "courses": [
                {"recipe_slug": "arroz-pato-menu", "servings": 8},
                {"recipe_slug": "merluza-verde-menu", "servings": 4},
            ],
        },
    )
    assert plan_resp.status_code == 200
    plan = plan_resp.json()
    assert plan["guest_count"] == 8.0
    assert "Fondo Base de Carne" in plan["courses"][0]["subrecipes_used"]

    # Shopping list aggregates Ajo morado across sub-recipe (2*30? 1*30=30g) + arroz (2*20=40g) + merluza (20g) = 90g
    garlic = next(item for item in plan["shopping_list"] if item["name"].lower() == "ajo morado")
    assert garlic["total_amount"] == 90.0
    assert garlic["unit"] == "g"

    kinds = {step["kind"] for step in plan["timeline"]}
    assert {"subrecipe", "prep", "cook", "wine_decant", "wine_chill", "service"}.issubset(kinds)
    assert plan["timeline"][-1]["clock_time"] == "21:30"
    assert plan["total_food_cost_eur"] is not None
    assert plan["total_wine_cost_eur"] == 43.0
    assert plan["cost_per_guest_eur"] is not None


def test_quick_capture_and_alembic_0002_migration(
    full_client: tuple[TestClient, Path, Path],
    tmp_path: Path,
) -> None:
    """Quick-capture converts freeform text into Recipe and Alembic 0002 migrates cleanly."""
    client, _, _ = full_client
    raw_notes = """# Tartar de Atún Picante
Corte a cuchillo con toque cítrico #atún #crudo
Ingredientes:
- 300 g lomo de atún rojo
- 15 ml salsa de soja
- 1 ud lima
Pasos:
1. Picar el atún en dados de 5 mm y reposar 10 min a 4 °C.
"""
    preview = client.post(
        "/api/recipes/quick-capture",
        json={"raw_text": raw_notes, "category": "Entrantes y Cuchara", "save": False},
    )
    assert preview.status_code == 200
    draft = preview.json()
    assert draft["title"] == "Tartar de Atún Picante"
    assert len(draft["ingredients"]) == 3
    assert draft["steps"][0]["duration_minutes"] == 10
    assert draft["steps"][0]["temp_c"] == 4.0
    assert "atún" in draft["tags"]
    assert client.get(f"/api/recipes/{draft['id']}").status_code == 404

    saved = client.post(
        "/api/recipes/quick-capture",
        json={"raw_text": raw_notes, "category": "Entrantes y Cuchara", "save": True},
    )
    assert saved.status_code == 200
    assert client.get(f"/api/recipes/{saved.json()['id']}").status_code == 200

    # Verify Alembic 0002 upgrade & downgrade on unit_cost_eur
    db_file = tmp_path / "alembic_0002.db"
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    eng = create_engine(f"sqlite:///{db_file}")
    cols_head = {c["name"] for c in inspect(eng).get_columns("recipe_ingredients")}
    assert "unit_cost_eur" in cols_head

    command.downgrade(cfg, "0001_baseline")
    cols_0001 = {c["name"] for c in inspect(eng).get_columns("recipe_ingredients")}
    assert "unit_cost_eur" not in cols_0001

    command.upgrade(cfg, "head")
    cols_reup = {c["name"] for c in inspect(eng).get_columns("recipe_ingredients")}
    assert "unit_cost_eur" in cols_reup
    eng.dispose()
