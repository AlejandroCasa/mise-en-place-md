"""Alembic migration environment for culinary and pairing schemas."""

from __future__ import annotations

from collections.abc import MutableMapping
from logging.config import fileConfig

from sqlalchemy import create_engine, pool, text

import app.db_models  # noqa: F401  # Register ORM models on Base.metadata
from alembic import context
from app.database import SCHEMA_TRANSLATE_SQLITE, Base, settings

MANAGED_SCHEMAS = {"culinary", "pairing"}

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_database_url() -> str:
    """Resolve database URL from Alembic config override or MISE_DATABASE_URL."""
    configured = config.get_main_option("sqlalchemy.url")
    if configured:
        return configured
    return settings.database_url


def include_name(
    name: str | None,
    type_: str,
    _parent_names: MutableMapping[str, str | None],
) -> bool:
    """Restrict Alembic schema inspection strictly to culinary and pairing."""
    if type_ == "schema":
        return name in MANAGED_SCHEMAS
    return True


def run_migrations_offline() -> None:
    """Run migrations in offline SQL generation mode."""
    url = get_database_url()
    is_sqlite = url.startswith("sqlite")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=not is_sqlite,
        include_name=include_name if not is_sqlite else None,
        version_table_schema="culinary" if not is_sqlite else None,
        render_as_batch=is_sqlite,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live PostgreSQL or SQLite connection."""
    url = get_database_url()
    is_sqlite = url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    connectable = create_engine(url, poolclass=pool.NullPool, connect_args=connect_args)

    with connectable.connect() as raw_connection:
        connection = (
            raw_connection.execution_options(schema_translate_map=SCHEMA_TRANSLATE_SQLITE)
            if is_sqlite
            else raw_connection
        )
        if not is_sqlite:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS culinary"))
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS pairing"))
            connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=not is_sqlite,
            include_name=include_name if not is_sqlite else None,
            version_table_schema="culinary" if not is_sqlite else None,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
