"""Integration and unit tests for Mise en Place MD PostgreSQL repository and Vinum Pulse bridge."""

from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

import app.main as main_module
from alembic import command
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

    sea_sug = isolated_client.get(f"/api/recipes/{created_sea['id']}/wine-suggestion")
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


def test_modular_frontend_es_assets_and_zero_inline_handlers(
    isolated_client: TestClient,
) -> None:
    """Verify SPA serves ES module entrypoint with zero inline event handlers."""
    index_resp = isolated_client.get("/")
    assert index_resp.status_code == 200
    html = index_resp.text
    assert '<script type="module" src="/static/js/main.js"></script>' in html
    for forbidden in ("onclick=", "oninput=", "onchange=", "ontoggle="):
        assert forbidden not in html.lower()

    for module_name in (
        "constants.js",
        "state.js",
        "api.js",
        "timers.js",
        "views.js",
        "editor.js",
        "main.js",
    ):
        mod_resp = isolated_client.get(f"/static/js/{module_name}")
        assert mod_resp.status_code == 200
        assert "javascript" in mod_resp.headers["content-type"]

    legacy_resp = isolated_client.get("/static/app.js")
    assert legacy_resp.status_code == 404


def test_server_side_filtering_search_and_sorting(isolated_client: TestClient) -> None:
    """Verify server-side search, utensil/technique/cookable/tag filters, and sorting."""
    isolated_client.post(
        "/api/utensils",
        json={
            "id": "cocotte-test-p0",
            "name": "Cocotte Test P0",
            "category": "Cocción",
            "owned": True,
        },
    )
    isolated_client.post(
        "/api/utensils",
        json={
            "id": "roner-test-p0",
            "name": "Roner Test P0",
            "category": "Vanguardia",
            "owned": False,
        },
    )

    r1 = _sample_recipe_payload(title="Zumo de Carrillera P0", tags=["p0-suite", "setas-p0"])
    r1["category"] = "Arroces"
    r1["difficulty"] = 4
    r1["rating"] = 4.9
    r1["techniques"] = ["Sofrito P0", "Cocción lenta P0"]
    r1["timings"] = {"prep_minutes": 30, "cook_minutes": 45, "rest_minutes": 5}
    r1["utensils"] = [
        {"utensil_id": "cocotte-test-p0", "name": "Cocotte Test P0", "mandatory": True},
    ]

    r2 = _sample_recipe_payload(title="Salmón Baja Temp P0", tags=["p0-suite", "pescado-p0"])
    r2["subtitle"] = "Con emulsión cítrica"
    r2["chef_notes"] = "No usar carrillera; cocinado en roner."
    r2["category"] = "Pescados y Mariscos"
    r2["difficulty"] = 2
    r2["rating"] = 4.2
    r2["techniques"] = ["Sous-vide P0"]
    r2["timings"] = {"prep_minutes": 10, "cook_minutes": 20, "rest_minutes": 120}
    r2["ingredients"] = [{"name": "Lomo de salmón p0", "amount": 400, "unit": "g"}]
    r2["utensils"] = [
        {"utensil_id": "roner-test-p0", "name": "Roner Test P0", "mandatory": True},
    ]

    r3 = _sample_recipe_payload(title="Fondo Oscuro Base P0", tags=["p0-suite", "base-p0"])
    r3["subtitle"] = "Reducción clásica de carrillera para arroces"
    r3["chef_notes"] = "Ideal para acompañar platos de arroz y caza."
    r3["category"] = "Fondo / Base"
    r3["is_subrecipe"] = True
    r3["difficulty"] = 3
    r3["rating"] = 4.6
    r3["techniques"] = ["Reducción P0"]
    r3["timings"] = {"prep_minutes": 15, "cook_minutes": 180, "rest_minutes": 0}
    r3["ingredients"] = [{"name": "Huesos de ternera p0", "amount": 1000, "unit": "g"}]
    r3["utensils"] = [
        {"utensil_id": "roner-test-p0", "name": "Roner Test P0", "mandatory": False},
    ]

    for payload in (r1, r2, r3):
        assert isolated_client.post("/api/recipes", json=payload).status_code == 200

    # Cookable filter excludes r2 (mandatory unowned roner-test-p0) but keeps r3 (optional) & r1
    cookable_ids = {
        r["id"]
        for r in isolated_client.get(
            "/api/recipes", params={"cookable": True, "tag": "p0-suite"}
        ).json()
    }
    assert cookable_ids == {"zumo-de-carrillera-p0", "fondo-oscuro-base-p0"}

    # Utensil, technique, category, is_subrecipe, and ingredient filters
    assert [
        r["id"]
        for r in isolated_client.get("/api/recipes", params={"utensil": "cocotte-test-p0"}).json()
    ] == ["zumo-de-carrillera-p0"]
    assert [
        r["id"]
        for r in isolated_client.get("/api/recipes", params={"technique": "Sous-vide P0"}).json()
    ] == ["salmon-baja-temp-p0"]
    assert {
        r["id"] for r in isolated_client.get("/api/recipes", params={"tag": "p0-suite"}).json()
    } == {"zumo-de-carrillera-p0", "salmon-baja-temp-p0", "fondo-oscuro-base-p0"}
    assert [
        r["id"]
        for r in isolated_client.get(
            "/api/recipes", params={"is_subrecipe": True, "tag": "p0-suite"}
        ).json()
    ] == ["fondo-oscuro-base-p0"]
    assert [
        r["id"]
        for r in isolated_client.get(
            "/api/recipes",
            params={"tag": "p0-suite", "ing_include": "salmón p0", "ing_exclude": "boletus"},
        ).json()
    ] == ["salmon-baja-temp-p0"]
    assert [
        r["id"]
        for r in isolated_client.get(
            "/api/recipes",
            params={"tag": "p0-suite", "category": "Arroces"},
        ).json()
    ] == ["zumo-de-carrillera-p0"]

    # Relevance ranking, OR syntax, and websearch negation
    fts_ranked = isolated_client.get(
        "/api/recipes", params={"q": "carrillera", "tag": "p0-suite", "sort_by": "relevance"}
    ).json()
    assert fts_ranked[0]["id"] == "zumo-de-carrillera-p0"

    negated = isolated_client.get(
        "/api/recipes", params={"q": "carrillera -roner", "tag": "p0-suite"}
    ).json()
    assert {r["id"] for r in negated} == {"zumo-de-carrillera-p0", "fondo-oscuro-base-p0"}

    or_query = isolated_client.get(
        "/api/recipes", params={"q": "salmón OR reducción", "tag": "p0-suite"}
    ).json()
    assert {r["id"] for r in or_query} == {"salmon-baja-temp-p0", "fondo-oscuro-base-p0"}

    # Sorting modes + pagination
    for sort_mode, expected_order in (
        ("title_asc", ["fondo-oscuro-base-p0", "salmon-baja-temp-p0", "zumo-de-carrillera-p0"]),
        ("title_desc", ["zumo-de-carrillera-p0", "salmon-baja-temp-p0", "fondo-oscuro-base-p0"]),
        (
            "difficulty_asc",
            ["salmon-baja-temp-p0", "fondo-oscuro-base-p0", "zumo-de-carrillera-p0"],
        ),
        (
            "difficulty_desc",
            ["zumo-de-carrillera-p0", "fondo-oscuro-base-p0", "salmon-baja-temp-p0"],
        ),
        ("rating_desc", ["zumo-de-carrillera-p0", "fondo-oscuro-base-p0", "salmon-baja-temp-p0"]),
        (
            "active_time_asc",
            ["salmon-baja-temp-p0", "zumo-de-carrillera-p0", "fondo-oscuro-base-p0"],
        ),
        (
            "total_time_asc",
            ["zumo-de-carrillera-p0", "salmon-baja-temp-p0", "fondo-oscuro-base-p0"],
        ),
    ):
        actual = [
            r["id"]
            for r in isolated_client.get(
                "/api/recipes", params={"tag": "p0-suite", "sort_by": sort_mode}
            ).json()
        ]
        assert actual == expected_order, f"Mismatch for {sort_mode}: {actual}"

    # Verify updated_desc and relevance without q + pagination execute cleanly
    assert (
        len(
            isolated_client.get(
                "/api/recipes", params={"tag": "p0-suite", "sort_by": "updated_desc"}
            ).json()
        )
        == 3
    )
    assert (
        len(
            isolated_client.get(
                "/api/recipes",
                params={"tag": "p0-suite", "sort_by": "relevance", "limit": 2, "offset": 1},
            ).json()
        )
        == 2
    )


def test_postgres_fts_sql_compilation() -> None:
    """Verify PostgreSQL query path emits websearch_to_tsquery, ts_rank, and GIN operators."""
    captured_stmts: list[Any] = []
    pg_dialect = create_engine("postgresql+psycopg://localhost/gastronomy").dialect

    class _FakeScalarResult:
        def all(self) -> list[Any]:
            return []

    class _FakePostgresSession:
        bind = type("_Bind", (), {"dialect": pg_dialect})()

        def __enter__(self) -> _FakePostgresSession:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def scalars(self, stmt: Any) -> _FakeScalarResult:
            captured_stmts.append(stmt)
            return _FakeScalarResult()

    repo = RecipeRepository(session_factory=_FakePostgresSession)  # type: ignore[arg-type]
    assert (
        repo.list_recipes(
            q="carrillera setas",
            tag="carrillera",
            technique="Sous-vide",
            sort_by="relevance",
        )
        == []
    )
    assert (
        repo.list_recipes(
            q="carrillera -marisco",
            sort_by="total_time_asc",
        )
        == []
    )

    compiled_1 = captured_stmts[0].compile(dialect=pg_dialect)
    pg_sql_1 = str(compiled_1)
    assert "websearch_to_tsquery(" in pg_sql_1
    assert "spanish" in compiled_1.params.values()
    assert "carrillera setas" in compiled_1.params.values()
    assert "ts_rank(" in pg_sql_1
    assert "search_tsv @@" in pg_sql_1
    assert "tags @>" in pg_sql_1
    assert "tags &&" in pg_sql_1
    assert "techniques @>" in pg_sql_1

    compiled_2 = captured_stmts[1].compile(dialect=pg_dialect)
    pg_sql_2 = str(compiled_2)
    assert "websearch_to_tsquery(" in pg_sql_2
    assert "carrillera -marisco" in compiled_2.params.values()
    assert "tags &&" not in pg_sql_2


def test_subrecipe_dag_cycle_detection_returns_422(isolated_client: TestClient) -> None:
    """Reject direct, self-referential, and transitive sub-recipe cycles with HTTP 422."""
    # 1. Self-loop on creation (POST /api/recipes)
    self_payload = _sample_recipe_payload(title="Receta Auto Ciclo")
    self_payload["id"] = "receta-auto-ciclo"
    self_payload["subrecipes"] = [{"recipe_id": "receta-auto-ciclo", "name": "Self"}]
    self_resp = isolated_client.post("/api/recipes", json=self_payload)
    assert self_resp.status_code == 422
    assert "receta-auto-ciclo" in self_resp.json()["cycle"]
    assert isolated_client.get("/api/recipes/receta-auto-ciclo").status_code == 404

    # 2. Build valid diamond DAG: A -> [B, C], B -> [D], C -> [D]
    for slug, title, is_sub in (
        ("dag-d", "DAG D", True),
        ("dag-b", "DAG B", True),
        ("dag-c", "DAG C", True),
        ("dag-a", "DAG A", False),
    ):
        payload = _sample_recipe_payload(title=title)
        payload["id"] = slug
        payload["is_subrecipe"] = is_sub
        assert isolated_client.post("/api/recipes", json=payload).status_code == 200

    b_upd = isolated_client.get("/api/recipes/dag-b").json()
    b_upd["subrecipes"] = [{"recipe_id": "dag-d", "name": "DAG D", "amount": 100, "unit": "g"}]
    assert isolated_client.put("/api/recipes/dag-b", json=b_upd).status_code == 200

    c_upd = isolated_client.get("/api/recipes/dag-c").json()
    c_upd["subrecipes"] = [{"recipe_id": "dag-d", "name": "DAG D", "amount": 100, "unit": "g"}]
    assert isolated_client.put("/api/recipes/dag-c", json=c_upd).status_code == 200

    a_upd = isolated_client.get("/api/recipes/dag-a").json()
    a_upd["subrecipes"] = [
        {"recipe_id": "dag-b", "name": "DAG B", "amount": 200, "unit": "g"},
        {"recipe_id": "dag-c", "name": "DAG C", "amount": 150, "unit": "g"},
    ]
    a_res = isolated_client.put("/api/recipes/dag-a", json=a_upd)
    assert a_res.status_code == 200
    assert len(a_res.json()["subrecipes"]) == 2

    # 3. Direct 2-node cycle: D -> B when B -> D exists
    d_upd = isolated_client.get("/api/recipes/dag-d").json()
    d_upd["subrecipes"] = [{"recipe_id": "dag-b", "name": "DAG B", "amount": 50, "unit": "g"}]
    direct_cycle = isolated_client.put("/api/recipes/dag-d", json=d_upd)
    assert direct_cycle.status_code == 422
    assert direct_cycle.json()["cycle"] == ["dag-d", "dag-b", "dag-d"]

    # 4. Transitive 3-node cycle: D -> A when A -> B -> D exists
    d_upd["subrecipes"] = [{"recipe_id": "dag-a", "name": "DAG A", "amount": 50, "unit": "g"}]
    transitive_cycle = isolated_client.put("/api/recipes/dag-d", json=d_upd)
    assert transitive_cycle.status_code == 422
    assert transitive_cycle.json()["cycle"][0] == "dag-d"
    assert transitive_cycle.json()["cycle"][-1] == "dag-d"

    # Confirm rollback preserved D with 0 subrecipes
    assert isolated_client.get("/api/recipes/dag-d").json()["subrecipes"] == []

    # 5. Markdown import endpoint also enforces DAG cycle detection with 422
    md_cycle = """---
id: dag-d
title: DAG D
subrecipes:
  - recipe_id: dag-a
    name: DAG A
    amount: 50
    unit: g
---
# DAG D
"""
    md_resp = isolated_client.put("/api/recipes/dag-d/markdown", json={"content": md_cycle})
    assert md_resp.status_code == 422


def test_alembic_baseline_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    """Verify Alembic baseline migration upgrades, downgrades, and re-upgrades cleanly."""
    db_file = tmp_path / "alembic_test.db"
    db_url = f"sqlite:///{db_file}"
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", db_url)

    command.upgrade(cfg, "head")
    eng = create_engine(db_url)
    tables_after_up = set(inspect(eng).get_table_names())
    assert {
        "recipes",
        "recipe_ingredients",
        "recipe_subrecipes",
        "utensils",
        "recipe_utensils",
        "dish_recipe_links",
        "recipe_sensory_profiles",
        "tag_wine_affinity",
        "alembic_version",
    }.issubset(tables_after_up)

    command.downgrade(cfg, "base")
    tables_after_down = set(inspect(eng).get_table_names())
    assert "recipes" not in tables_after_down
    assert "recipe_subrecipes" not in tables_after_down

    command.upgrade(cfg, "head")
    assert "recipes" in set(inspect(eng).get_table_names())
    eng.dispose()
