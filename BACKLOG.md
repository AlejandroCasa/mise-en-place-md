# Technical Backlog & Architecture Roadmap

This file tracks prioritized engineering improvements, technical debt, and completed milestones for **Mise en Place MD (`mise-en-place-md`)**.

## 🎯 Prioritized Backlog

### P0 — Critical / Production Readiness & Cross-App Foundation
- [ ] **[CI/CD]** Add `.github/workflows/ci.yml` running `ruff`, `mypy --strict`, `bandit`, and `pytest --cov >= 85%` on every PR (Impact: High | Effort: S)
- [ ] **[Migrations]** Add Alembic incremental migration scaffolding on top of `db/init/01_gastronomy_schema.sql` for future schema evolution (Impact: Medium | Effort: S)

### P1 — Phase 2: UI Redesign & Vinum Pulse Visual Integration
- [ ] **[Frontend Redesign]** Redesign `mise-en-place-md` UI against the live PostgreSQL API, rendering the embedded "Maridaje Sugerido" card from `GET /api/recipes/{slug}/wine-suggestion` and handling `/recipes/{slug}` deep links (Impact: High | Effort: L)
- [ ] **[Vinum Pulse UI]** Add direct "Ver Receta →" button on Vinum Pulse dish cards and pairing results whenever `dish.recipe_url` is present (Impact: High | Effort: S)
- [ ] **[Catalog Alignment]** Curate initial `pairing.dish_recipe_links` bindings between Vinum Pulse's 45 dishes and Mise en Place recipes (Impact: High | Effort: S)

### P2 — Containerization & Observability
- [ ] **[Docker]** Create multi-stage non-root `Dockerfile` (`UID >= 10001`) using `uv` cache mounts, `.dockerignore`, and native `HEALTHCHECK` (`GET /healthz`) (Impact: Medium | Effort: S)
- [ ] **[Data Integrity]** Add DAG cycle validation for `recipe_subrecipes` to prevent circular sub-recipe references (Impact: Medium | Effort: S)

---

## ✅ Completed Milestones
- [x] **[Database & Pairing Bridge]** Migrated to `uv` + `pyproject.toml`, spun up local Docker `postgres:16-alpine` (`culinary`, `enology`, `pairing`), implemented SQLAlchemy 2.0 PostgreSQL repository with dynamic Markdown import/export, `GET /api/recipes/{id}/wine-suggestion`, `POST /api/pairing/links`, `/healthz`, `/recipes/{id}` deep links, restricted CORS, and `pytest` suite (`85%` coverage, `ruff`/`mypy --strict`/`bandit` clean) — Branch: `feat/postgres-persistence-and-vinum-bridge`, Commit: `4ff24c6` (`2026-11-19`)
- [x] **[Workspace Governance]** Onboarded repository into Antigravity workspace (`c:/Workspace/mise-en-place-md`), authored `AGENTS.md`, `BACKLOG.md`, Obsidian Hub (`[[Mise-en-Place-MD]]`), Spec, and shared PostgreSQL Architecture `[[ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse]]` — Branch: `chore/antigravity-workspace-setup`, Commit: `88711fb` (`2026-11-19`)
