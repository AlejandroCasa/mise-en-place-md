"""Database configuration, SQLAlchemy 2.0 engine, and session factory for Mise en Place MD."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

SCHEMA_TRANSLATE_SQLITE: dict[str, str | None] = {
    "culinary": None,
    "enology": None,
    "pairing": None,
}


class Settings(BaseSettings):
    """Application configuration injected via MISE_* environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="MISE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./mise_en_place.db"
    vinum_pulse_base_url: str = "http://127.0.0.1:8000"
    cors_origins: str = (
        "http://127.0.0.1:8000,http://127.0.0.1:8001,"
        "http://localhost:8000,http://localhost:8001"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Return sanitized list of allowed CORS origins."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


class Base(DeclarativeBase):
    """Declarative base for culinary, enology, and pairing ORM models."""


def create_db_engine(database_url: str) -> Engine:
    """Create a SQLAlchemy 2.0 engine for PostgreSQL 16 or SQLite (unit tests)."""
    kwargs: dict[str, Any] = {}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in database_url:
            kwargs["poolclass"] = StaticPool
        engine = create_engine(database_url, **kwargs)
        return engine.execution_options(schema_translate_map=SCHEMA_TRANSLATE_SQLITE)

    kwargs["pool_pre_ping"] = True
    return create_engine(database_url, **kwargs)


settings = Settings()
engine = create_db_engine(settings.database_url)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """Provide a transactional SQLAlchemy session dependency."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
