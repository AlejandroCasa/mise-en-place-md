# Technical Backlog & Architecture Roadmap

This file tracks prioritized engineering improvements, technical debt, and completed milestones for **Mise en Place MD (`mise-en-place-md`)**.

## 🎯 Prioritized Backlog (Sprint `2026-W48`)

### P0 — Engineering Foundation, Search & Data Integrity
- [ ] **[Frontend Modularity]** Split `app/static/app.js` into ES modules (API client, state, scaling, timers, views, editor), eliminate inline `onclick="..."` handlers (event delegation / reduced XSS surface), and add automated frontend tests (Impact: High | Effort: M)
- [ ] **[PostgreSQL Full-Text Search]** Move search (`websearch_to_tsquery('spanish', q)` + `ts_rank` using existing `search_tsv` GIN index), utensil/technique/cookable filtering, and sorting to server-side `RecipeRepository` (Impact: High | Effort: M)
- [ ] **[Migrations & DAG Integrity]** Add Alembic incremental migration scaffolding on top of `db/init/01_gastronomy_schema.sql` and add server-side cycle detection (DFS/topological sort) on `recipe_subrecipes` returning `422` on circular references (Impact: High | Effort: S)
- [ ] **[CI/CD & Hardened Docker]** Add `.github/workflows/ci.yml` (`ruff`, `mypy --strict`, `bandit`, `pytest --cov >= 85%`) and multi-stage non-root `Dockerfile` (`UID >= 10001`, `uv` cache mounts, `.dockerignore`, native `HEALTHCHECK` on `/healthz`) wired into `docker-compose.yml` (Impact: High | Effort: S)

### P1 — Product Features & Bidirectional Vinum Pulse Synergy
- [ ] **[Live Pairing & Cellar Match]** Cross-reference Vinum Pulse wine suggestions against `enology.cellar_items` ("Available in your cellar: N bottles") and add reverse flow: pick a cellar bottle to discover best-matching recipes (Impact: High | Effort: M)
- [ ] **[Multi-Course Menu Planner]** Group 2–4 recipes into a dinner service, scale per guest, explode sub-recipe DAGs into a unified shopping list, and generate a reverse prep/decanting countdown timeline using Vinum Pulse `decant_minutes` (Impact: High | Effort: L)
- [ ] **[Hands-Free Kitchen Mode]** Upgrade Kitchen Mode into a distraction-free step-by-step execution view showing active step, contextual step ingredients, integrated timers, Wake Lock indicator, and `48px+` touch targets (Impact: High | Effort: M)
- [ ] **[Upload Hardening & Observability]** Harden `POST /api/upload` (MIME magic-byte check, max size, EXIF strip + WebP), parse `PUT /api/recipes/{id}/markdown` in-memory without temp `.import-*.md` files, and add structured JSON logging with `request_id` (Impact: Medium | Effort: S)
- [ ] **[Vinum Pulse UI & Catalog Alignment]** Add "Ver Receta →" links on Vinum Pulse dishes and curate initial `pairing.dish_recipe_links` bindings between Vinum Pulse dishes and Mise en Place recipes (Impact: High | Effort: S)

### P2 — Culinary R&D & Quick Capture
- [ ] **[R&D Log & Food Costing]** Upgrade `iterations` with version comparison (`v1.0` vs `v1.2`) and per-iteration photos; add optional unit ingredient cost to compute cost per serving + Vinum Pulse bottle cost per guest (Impact: Medium | Effort: M)
- [ ] **[Quick Capture & Pantry Filter]** Add fridge/seasonal ingredient quick filter ("¿Qué cocino hoy?") and a quick-capture inbox to turn raw text or minimal Markdown into draft technical recipes (Impact: Medium | Effort: M)

---

## ✅ Completed Milestones
- [x] **[UI/UX Atelier Redesign — Pass 1]** Eliminated Tailwind CDN and AI-slop patterns, authored domain-token design system (`.interface-design/system.md`, `Newsreader` + `Plus Jakarta Sans` + `JetBrains Mono`, authored `1.65px` SVG icons, hairline telemetry strip, Vernier scaler), wired live **Vinum Pulse Maridaje** strip (`GET /api/recipes/{id}/wine-suggestion`) and `/recipes/{slug}` SPA deep links (`2026-11-20`)
- [x] **[Database & Pairing Bridge]** Migrated to `uv` + `pyproject.toml`, spun up local Docker `postgres:16-alpine` (`culinary`, `enology`, `pairing`), implemented SQLAlchemy 2.0 PostgreSQL repository with dynamic Markdown import/export, `GET /api/recipes/{id}/wine-suggestion`, `POST /api/pairing/links`, `/healthz`, `/recipes/{id}` deep links, restricted CORS, and `pytest` suite (`85%` coverage, `ruff`/`mypy --strict`/`bandit` clean) — Branch: `feat/postgres-persistence-and-vinum-bridge`, Commit: `4ff24c6` (`2026-11-19`)
- [x] **[Workspace Governance]** Onboarded repository into Antigravity workspace (`c:/Workspace/mise-en-place-md`), authored `AGENTS.md`, `BACKLOG.md`, Obsidian Hub (`[[Mise-en-Place-MD]]`), Spec, and shared PostgreSQL Architecture `[[ADR-0030-gastronomic-ecosystem-postgres-architecture-mise-en-place-vinum-pulse]]` — Branch: `chore/antigravity-workspace-setup`, Commit: `88711fb` (`2026-11-19`)
