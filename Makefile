.PHONY: install dev dev-pg test check docker

install:
	uv sync --frozen

dev:
	uv run uvicorn app.main:app --host 127.0.0.1 --port $${MISE_PORT:-8001} --reload

dev-pg:
	docker compose up -d postgres
	uv run alembic upgrade head
	uv run uvicorn app.main:app --host 127.0.0.1 --port $${MISE_PORT:-8001} --reload

test:
	uv run pytest --cov-fail-under=85
	node --test tests/frontend/frontend.test.mjs

check:
	python3 /mnt/c/Users/acasa/.gemini/config/skills/quality-gate-and-commit/scripts/verify_repo_standard.py .
	uv lock --check
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy --strict app tests
	uv run bandit -c pyproject.toml -r app/
	gitleaks detect --no-banner
	uv run pytest --cov-fail-under=85
	node --test tests/frontend/frontend.test.mjs

docker:
	docker compose up --build -d
