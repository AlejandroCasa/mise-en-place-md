# Mise en Place MD — Repository Engineering Rules

Inherits global CTO governance from `c:/Workspace/AGENTS.md`.

## 1. Repository Architecture & Scope
- **Service**: **Mise en Place MD (Atelier Culinario)** — Technical Recipe & Culinary R&D Platform (`FastAPI` + `Pydantic v2` + Obsidian-compatible Markdown/YAML persistence evolving toward shared PostgreSQL + Vanilla JS/HTML5/CSS SPA served at `/`).
- **Audience & Product Goal**: Provide a high-precision culinary engineering workspace (baker's percentages & serving scaling, sub-recipe DAGs, temperature control points, utensils inventory, chef iteration logs, and bidirectional wine pairing with **Vinum Pulse**).
- **Source Layout**:
  - `app/models.py`: Pydantic v2 domain contracts (`Recipe`, `Ingredient`, `RecipeStep`, `Timings`, `TemperaturePoint`, `SubRecipeLink`, `UtensilCatalogItem`, `IterationEntry`).
  - `app/storage.py`: Markdown + YAML frontmatter persistence engine (`data/recipes/*.md`, `data/utensils.yaml`, `data/media/`).
  - `app/seed.py`: Initial technical recipes and utensils catalog seed.
  - `app/main.py`: FastAPI REST API (`CRUD /api/recipes`, `GET/PUT /api/recipes/{id}/markdown`, `GET/POST/PUT /api/utensils`, `POST /api/upload`, `GET /api/info`) and SPA static frontend (`GET /`).
  - `app/static/`: Interactive web application (`index.html`, `app.js`, `styles.css`).
  - `data/`: Local Markdown recipes, utensils YAML, and uploaded media.
- **Cross-Project Integration (`Vinum Pulse`)**:
  - Connects with `c:/Workspace/vinum-pulse` via the shared PostgreSQL bounded-context architecture documented in `[[ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse]]`:
    - **Recipe → Wine**: Selecting a recipe suggests a mid-price wine of the dominant/most compatible wine type from `enology.wines`.
    - **Dish → Recipe**: Every dish in Vinum Pulse links directly to its corresponding recipe deep-link (`/recipes/{slug}`) in Mise en Place MD.

## 2. Mandatory Quality Gates & CI/CD Standard (WSL 2 Ubuntu)
> **Migration Note**: Target toolchain is Python 3.12+ managed via `uv` (`pyproject.toml` + `uv.lock`). Once migrated from `requirements.txt` (tracked as P0 in `BACKLOG.md`), enforce all gates from `c:/Workspace/mise-en-place-md` via `wsl bash -lc`:
1. **Sync / Lock Dependencies**: `wsl bash -lc "uv lock && uv sync"`
2. **Formatting, Import Sorting & Linting**: `wsl bash -lc "uv run ruff check . && uv run ruff format --check ."`
3. **Static Type Check**: `wsl bash -lc "uv run mypy app tests"`
4. **Security SAST & Dependency Audit**: `wsl bash -lc "uv run bandit -c pyproject.toml -r app/ && uv run pip-audit"`
5. **Test Suite & Coverage (`>= 85%`, `0` warnings)**: `wsl bash -lc "uv run pytest -v --cov=app --cov-report=term-missing --cov-fail-under=85"`
6. **Container Build**: `wsl bash -lc "docker build -t mise-en-place-md:latest ."`

## 3. Obsidian Knowledge Links
- **Project Hub**: `c:/Workspace/docs/Proyectos/Mise-en-Place-MD.md` (`[[Mise-en-Place-MD]]`)
- **Functional Spec**: `c:/Workspace/docs/Proyectos/Mise-en-Place-MD-Spec.md` (`[[Mise-en-Place-MD-Spec]]`)
- **Related Ecosystem Hub**: `c:/Workspace/docs/Proyectos/Vinum-Pulse.md` (`[[Vinum-Pulse]]`)
- **Shared DB Architecture ADR**: `c:/Workspace/docs/Arquitectura/ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse.md` (`[[ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse]]`)
