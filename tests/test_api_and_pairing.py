"""Integration and unit tests for Mise en Place MD PostgreSQL repository and Vinum Pulse bridge."""

from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

import app.main as main_module
from app.database import create_db_engine
from app.db_models import DishRecord, WineRecord
from app.repository import RecipeRepository, safe_media_filename


@pytest.fixture()
def isolated_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Provide a FastAPI TestClient wired to an isolated in-memory SQLite database."""
    test_engine = create_db_engine("sqlite:///:memory:")
    test_session_local = sessionmaker(
        bind=test_engine,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
    )
    test_repo = RecipeRepository(session_factory=test_session_local)
    test_repo.init_and_seed(db_engine=test_engine, import_markdown_files=False)

    # Seed sample enology wines (3 Reds at 12, 24, 65 EUR and 3 Whites at 10, 19, 45 EUR)
    with test_session_local() as session:
        session.add_all(
            [
                WineRecord(
                    slug="rioja-joven",
                    name="Rioja Joven",
                    winery="Bodega Uno",
                    appellation="D.O.Ca. Rioja",
                    country="España",
                    classification="D.O.Ca.",
                    wine_type="Red",
                    vintage=2023,
                    price_eur=Decimal("12.00"),
                    serving_temp_c=Decimal("15.0"),
                    decant_minutes=0,
                    glass_type="Burdeos",
                    body=Decimal("6.00"),
                    acidity=Decimal("6.50"),
                    tannins=Decimal("5.50"),
                    fruit=Decimal("8.00"),
                    oak=Decimal("3.00"),
                    tasting_notes="Fruta roja fresca",
                    tagline="Ágil y frutal",
                ),
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
                    slug="priorat-gran-reserva",
                    name="Priorat Icono",
                    winery="Bodega Tres",
                    appellation="D.O.Q. Priorat",
                    country="España",
                    classification="D.O.Q.",
                    wine_type="Red",
                    vintage=2018,
                    price_eur=Decimal("65.00"),
                    serving_temp_c=Decimal("17.0"),
                    decant_minutes=45,
                    glass_type="Borgoña",
                    body=Decimal("9.50"),
                    acidity=Decimal("7.00"),
                    tannins=Decimal("9.00"),
                    fruit=Decimal("8.50"),
                    oak=Decimal("8.50"),
                    tasting_notes="Pizarra y fruta negra",
                    tagline="Alta gama",
                ),
                WineRecord(
                    slug="rueda-verdejo",
                    name="Rueda Verdejo",
                    winery="Bodega Cuatro",
                    appellation="D.O. Rueda",
                    country="España",
                    classification="D.O.",
                    wine_type="White",
                    vintage=2024,
                    price_eur=Decimal("10.00"),
                    serving_temp_c=Decimal("8.0"),
                    decant_minutes=0,
                    glass_type="Borgoña",
                    body=Decimal("5.00"),
                    acidity=Decimal("8.00"),
                    tannins=Decimal("1.00"),
                    fruit=Decimal("8.50"),
                    oak=Decimal("1.00"),
                    tasting_notes="Hinojo y cítricos",
                    tagline="Fresco",
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
                    tasting_notes="Salino, melocotón blanco y albaricoque",
                    tagline="Atlántico equilibrado",
                ),
                WineRecord(
                    slug="borgoña-premier-cru",
                    name="Meursault Premier Cru",
                    winery="Domaine Six",
                    appellation="AOC Bourgogne",
                    country="Francia",
                    classification="AOC",
                    wine_type="White",
                    vintage=2020,
                    price_eur=Decimal("45.00"),
                    serving_temp_c=Decimal("11.0"),
                    decant_minutes=15,
                    glass_type="Borgoña",
                    body=Decimal("8.00"),
                    acidity=Decimal("7.50"),
                    tannins=Decimal("1.50"),
                    fruit=Decimal("7.50"),
                    oak=Decimal("7.00"),
                    tasting_notes="Avellana tostada y mantequilla",
                    tagline="Borgoña mineral",
                ),
            ]
        )
        session.add(
            DishRecord(
                slug="carrillera-iberica-estofada",
                name="Carrillera Ibérica Estofada",
                category="Carnes y Caza",
                description="Carrillera melosa al vino tinto con setas",
                body=Decimal("8.50"),
                acidity=Decimal("6.50"),
                tannins=Decimal("7.50"),
                fruit=Decimal("8.00"),
                oak=Decimal("7.50"),
                suggested_wine_type="Red",
            )
        )
        session.commit()

    monkeypatch.setattr(main_module, "engine", test_engine)
    monkeypatch.setattr(main_module, "SessionLocal", test_session_local)
    monkeypatch.setattr(main_module, "repository", test_repo)

    with TestClient(main_module.app) as client:
        yield client


def _sample_recipe_payload(
    title: str = "Arroz Meloso de Carrillera Ibérica",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "title": title,
        "subtitle": "Cocción a baja temperatura con setas de otoño",
        "category": "Principal",
        "difficulty": 4,
        "rating": 4.8,
        "servings": 4,
        "yield_unit": "raciones",
        "scaling_mode": "servings",
        "techniques": ["Sous-vide", "Sofrito"],
        "tags": tags if tags is not None else ["carrillera", "ibérico", "setas"],
        "timings": {"prep_minutes": 30, "cook_minutes": 25, "rest_minutes": 5},
        "utensils": [
            {
                "utensil_id": "cocotte-hierro",
                "name": "Cocotte Hierro 26cm",
                "mandatory": True,
                "notes": "Reparto homogéneo",
            }
        ],
        "ingredients": [
            {"name": "Carrillera de cerdo ibérico", "amount": 600, "unit": "g"},
            {"name": "Boletus edulis", "amount": 150, "unit": "g"},
        ],
        "steps": [
            {"order": 1, "title": "Sellado", "instruction": "Dorar la carrillera."},
        ],
    }


def test_healthz_and_info(isolated_client: TestClient) -> None:
    """Health check and info endpoint return active DB backend metadata."""
    resp = isolated_client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    info = isolated_client.get("/api/info")
    assert info.status_code == 200
    assert "vinum_pulse_base_url" in info.json()


def test_recipe_crud_markdown_and_deep_link(isolated_client: TestClient) -> None:
    """Full CRUD lifecycle, dynamic Markdown export/import, and deep-link route."""
    create_resp = isolated_client.post("/api/recipes", json=_sample_recipe_payload())
    assert create_resp.status_code == 200
    created = create_resp.json()
    slug = created["id"]
    assert slug == "arroz-meloso-de-carrillera-iberica"
    assert len(created["ingredients"]) == 2

    # List with search filter
    list_resp = isolated_client.get("/api/recipes", params={"q": "Carrillera"})
    assert list_resp.status_code == 200
    assert any(r["id"] == slug for r in list_resp.json())

    # Deep-link route used by Vinum Pulse
    deep_resp = isolated_client.get(f"/recipes/{slug}")
    assert deep_resp.status_code == 200
    assert isolated_client.get("/recipes/no-existe").status_code == 404

    # Dynamic Markdown export from DB
    md_resp = isolated_client.get(f"/api/recipes/{slug}/markdown")
    assert md_resp.status_code == 200
    assert "# Arroz Meloso de Carrillera Ibérica" in md_resp.text

    # Re-import Markdown into DB
    reimport = isolated_client.put(
        f"/api/recipes/{slug}/markdown",
        json={"content": md_resp.text},
    )
    assert reimport.status_code == 200
    assert reimport.json()["id"] == slug

    # Update & delete
    updated_payload = _sample_recipe_payload(title="Arroz Meloso Actualizado")
    updated_payload["id"] = slug
    upd_resp = isolated_client.put(f"/api/recipes/{slug}", json=updated_payload)
    assert upd_resp.status_code == 200
    assert upd_resp.json()["title"] == "Arroz Meloso Actualizado"

    del_resp = isolated_client.delete(f"/api/recipes/{slug}")
    assert del_resp.status_code == 200
    assert isolated_client.get(f"/api/recipes/{slug}").status_code == 404


def test_wine_suggestion_by_tag_affinity_and_linked_dish(
    isolated_client: TestClient,
) -> None:
    """Suggests mid-price wine from dominant wine type via tag affinity and linked dish."""
    # 1. Seafood recipe -> infers White via tag_wine_affinity -> picks 19 EUR median Albariño
    seafood = _sample_recipe_payload(
        title="Lubina Salvaje al Horno",
        tags=["pescado", "lubina", "marisco"],
    )
    seafood["ingredients"] = [{"name": "Lubina salvaje", "amount": 800, "unit": "g"}]
    created_sea = isolated_client.post("/api/recipes", json=seafood).json()

    sea_sug = isolated_client.get(
        f"/api/recipes/{created_sea['id']}/wine-suggestion"
    )
    assert sea_sug.status_code == 200
    sea_data = sea_sug.json()
    assert sea_data["dominant_wine_type"] == "White"
    assert sea_data["resolution_source"] == "tag_affinity"
    assert sea_data["median_price_eur"] == 19.0
    assert sea_data["recommended_wine"]["slug"] == "rias-baixas-albarino"
    assert "/#carte?wine=rias-baixas-albarino" in sea_data["recommended_wine"]["vinum_url"]

    # 2. Carrillera recipe linked to Vinum Pulse dish -> picks 24 EUR median Ribera Crianza
    meat = isolated_client.post("/api/recipes", json=_sample_recipe_payload()).json()
    link_resp = isolated_client.post(
        "/api/pairing/links",
        json={
            "dish_slug": "carrillera-iberica-estofada",
            "recipe_slug": meat["id"],
            "is_primary": True,
            "match_source": "curated",
            "confidence": 0.98,
        },
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["is_primary"] is True

    meat_sug = isolated_client.get(f"/api/recipes/{meat['id']}/wine-suggestion")
    assert meat_sug.status_code == 200
    meat_data = meat_sug.json()
    assert meat_data["dominant_wine_type"] == "Red"
    assert meat_data["resolution_source"] == "linked_dish"
    assert meat_data["median_price_eur"] == 24.0
    assert meat_data["recommended_wine"]["slug"] == "ribera-crianza-medio"


def test_utensils_and_safe_filename(isolated_client: TestClient) -> None:
    """Utensil CRUD endpoints and path-traversal filename sanitization work safely."""
    post_resp = isolated_client.post(
        "/api/utensils",
        json={"id": "roner-pro", "name": "Roner Pro", "category": "Vanguardia", "owned": True},
    )
    assert post_resp.status_code == 200
    list_resp = isolated_client.get("/api/utensils")
    assert list_resp.status_code == 200
    assert any(u["id"] == "roner-pro" for u in list_resp.json())

    stem, ext = safe_media_filename("../../etc/passwd.exe")
    assert stem == "passwd"
    assert ext == ".jpg"
