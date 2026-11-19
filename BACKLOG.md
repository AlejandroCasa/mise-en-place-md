# Technical Backlog & Architecture Roadmap

This file tracks prioritized engineering improvements, technical debt, and completed milestones for **Mise en Place MD (`mise-en-place-md`)**.

## 🎯 Prioritized Backlog

### P0 — Critical / Production Readiness & Cross-App Foundation
- [ ] **[Tooling & CI]** Migrate from `requirements.txt` to `uv` + `pyproject.toml`, add `pytest` + `httpx` test suite (`>= 85%` coverage, `filterwarnings = ["error"]`), and configure GitHub Actions CI (`ruff`, `mypy --strict`, `bandit`, `pip-audit`) (Impact: High | Effort: M)
- [ ] **[Database Architecture]** Implement PostgreSQL persistence (`culinary` & `pairing` schemas via SQLAlchemy 2.0 + Alembic) aligned with `ADR-0030`, keeping Obsidian `.md` export/import as a bidirectional projection (Impact: High | Effort: L)
- [ ] **[Security]** Replace permissive `allow_origins=["*"]` CORS, migrate deprecated `@app.on_event("startup")` to FastAPI `lifespan`, sanitize `recipe_id` path traversal on filesystem operations, and externalize configuration via `pydantic-settings` (Impact: High | Effort: S)

### P1 — Vinum Pulse Bidirectional Integration
- [ ] **[Pairing Engine]** Implement `GET /api/recipes/{slug}/wine-suggestion` backed by `pairing.get_recipe_wine_suggestion()` to suggest a mid-price (median/IQR) wine of the dominant/most matching wine type from Vinum Pulse (Impact: High | Effort: M)
- [ ] **[Frontend Deep-Linking]** Support direct URL deep-linking (`/recipes/{slug}` or `#/recipe/{slug}`) so dishes in **Vinum Pulse** navigate seamlessly to the exact recipe view, and add an embedded "Maridaje Sugerido" card linking back to Vinum Pulse (Impact: High | Effort: M)
- [ ] **[Catalog Alignment]** Seed `pairing.dish_recipe_links` and `pairing.tag_wine_affinity` mapping Vinum Pulse's 45 curated dishes and culinary tags to recipes and wine typologies (Impact: High | Effort: S)

### P2 — Containerization & Observability
- [ ] **[Docker]** Create multi-stage non-root `Dockerfile` (`UID >= 10001`) using `uv` cache mounts, `.dockerignore`, and native `HEALTHCHECK` (`GET /healthz`) (Impact: Medium | Effort: S)
- [ ] **[Data Integrity]** Add DAG cycle validation for `recipe_subrecipes` to prevent circular sub-recipe references (Impact: Medium | Effort: S)

---

## ✅ Completed Milestones
- [x] **[Workspace Governance]** Onboarded repository into Antigravity workspace (`c:/Workspace/mise-en-place-md`), authored `AGENTS.md`, `BACKLOG.md`, Obsidian Hub (`[[Mise-en-Place-MD]]`), Spec, and shared PostgreSQL Architecture `[[ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse]]` — Branch: `chore/antigravity-workspace-setup` (`2026-11-19`)
