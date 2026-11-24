"""Baseline schema migration for culinary and pairing schemas on top of 01_gastronomy_schema.sql.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-23 00:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.database import SCHEMA_TRANSLATE_SQLITE, Base

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_POSTGRES_UPGRADE_STATEMENTS: tuple[str, ...] = (
    "CREATE SCHEMA IF NOT EXISTS culinary",
    "CREATE SCHEMA IF NOT EXISTS pairing",
    """
    CREATE TABLE IF NOT EXISTS culinary.recipes (
        id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        slug            text NOT NULL UNIQUE,
        title           text NOT NULL,
        subtitle        text NOT NULL DEFAULT '',
        category        text NOT NULL DEFAULT 'Principal',
        is_subrecipe    boolean NOT NULL DEFAULT false,
        difficulty      smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
        rating          numeric(3, 2) NOT NULL DEFAULT 0.00 CHECK (rating BETWEEN 0 AND 5),
        servings        numeric(8, 2) NOT NULL DEFAULT 4.00 CHECK (servings > 0),
        yield_unit      text NOT NULL DEFAULT 'raciones',
        scaling_mode    text NOT NULL DEFAULT 'servings' CHECK (scaling_mode IN ('servings', 'bakers_pct')),
        prep_minutes    integer NOT NULL DEFAULT 0 CHECK (prep_minutes >= 0),
        cook_minutes    integer NOT NULL DEFAULT 0 CHECK (cook_minutes >= 0),
        rest_minutes    integer NOT NULL DEFAULT 0 CHECK (rest_minutes >= 0),
        rest_notes      text NOT NULL DEFAULT '',
        tags            text[] NOT NULL DEFAULT '{}',
        techniques      text[] NOT NULL DEFAULT '{}',
        steps           jsonb NOT NULL DEFAULT '[]'::jsonb,
        temperatures    jsonb NOT NULL DEFAULT '[]'::jsonb,
        iterations      jsonb NOT NULL DEFAULT '[]'::jsonb,
        plating_notes   text NOT NULL DEFAULT '',
        chef_notes      text NOT NULL DEFAULT '',
        cover_photo_url text NOT NULL DEFAULT '',
        gallery         jsonb NOT NULL DEFAULT '[]'::jsonb,
        search_tsv      tsvector GENERATED ALWAYS AS (
            to_tsvector(
                'spanish',
                coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(chef_notes, '')
            )
        ) STORED,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS culinary.recipe_ingredients (
        id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        recipe_id        bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
        position         integer NOT NULL DEFAULT 0,
        name             text NOT NULL,
        amount           numeric(10, 3),
        unit             text NOT NULL DEFAULT 'g',
        ingredient_group text NOT NULL DEFAULT 'Principal',
        is_base_weight   boolean NOT NULL DEFAULT false,
        notes            text NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS culinary.recipe_subrecipes (
        parent_recipe_id bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
        child_recipe_id  bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE RESTRICT,
        name             text NOT NULL DEFAULT '',
        amount           numeric(10, 3),
        unit             text NOT NULL DEFAULT 'g',
        notes            text NOT NULL DEFAULT '',
        PRIMARY KEY (parent_recipe_id, child_recipe_id),
        CHECK (parent_recipe_id <> child_recipe_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS culinary.utensils (
        id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        slug     text NOT NULL UNIQUE,
        name     text NOT NULL,
        category text NOT NULL DEFAULT 'Cocción',
        owned    boolean NOT NULL DEFAULT true,
        specs    text NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS culinary.recipe_utensils (
        recipe_id  bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
        utensil_id bigint NOT NULL REFERENCES culinary.utensils(id) ON DELETE CASCADE,
        name       text NOT NULL DEFAULT '',
        mandatory  boolean NOT NULL DEFAULT true,
        notes      text NOT NULL DEFAULT '',
        PRIMARY KEY (recipe_id, utensil_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pairing.dish_recipe_links (
        id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        dish_id      bigint NOT NULL,
        recipe_id    bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
        is_primary   boolean NOT NULL DEFAULT false,
        match_source text NOT NULL DEFAULT 'manual' CHECK (match_source IN ('manual', 'curated', 'tag_inferred')),
        confidence   numeric(4, 3) NOT NULL DEFAULT 1.000 CHECK (confidence BETWEEN 0 AND 1),
        UNIQUE (dish_id, recipe_id)
    )
    """,
    """
    DO $$
    BEGIN
        IF to_regclass('enology.dishes') IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM pg_constraint
               WHERE conname = 'dish_recipe_links_dish_id_fkey'
           ) THEN
            ALTER TABLE pairing.dish_recipe_links
                ADD CONSTRAINT dish_recipe_links_dish_id_fkey
                FOREIGN KEY (dish_id) REFERENCES enology.dishes(id) ON DELETE CASCADE;
        END IF;
    END $$;
    """,
    """
    CREATE TABLE IF NOT EXISTS pairing.recipe_sensory_profiles (
        recipe_id          bigint PRIMARY KEY REFERENCES culinary.recipes(id) ON DELETE CASCADE,
        dominant_wine_type text NOT NULL CHECK (dominant_wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose')),
        body               numeric(4, 2) CHECK (body BETWEEN 1 AND 10),
        acidity            numeric(4, 2) CHECK (acidity BETWEEN 1 AND 10),
        tannins            numeric(4, 2) CHECK (tannins BETWEEN 1 AND 10),
        fruit              numeric(4, 2) CHECK (fruit BETWEEN 1 AND 10),
        oak                numeric(4, 2) CHECK (oak BETWEEN 1 AND 10),
        source             text NOT NULL DEFAULT 'inferred' CHECK (source IN ('manual', 'inferred'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pairing.tag_wine_affinity (
        id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        keyword   text NOT NULL,
        wine_type text NOT NULL CHECK (wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose')),
        weight    numeric(4, 2) NOT NULL DEFAULT 1.00 CHECK (weight > 0),
        UNIQUE (keyword, wine_type)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe_id ON culinary.recipe_ingredients (recipe_id)",
    "CREATE INDEX IF NOT EXISTS ix_recipe_subrecipes_child_id ON culinary.recipe_subrecipes (child_recipe_id)",
    "CREATE INDEX IF NOT EXISTS ix_recipe_utensils_utensil_id ON culinary.recipe_utensils (utensil_id)",
    "CREATE INDEX IF NOT EXISTS ix_recipes_search_tsv ON culinary.recipes USING gin (search_tsv)",
    "CREATE INDEX IF NOT EXISTS ix_recipes_tags ON culinary.recipes USING gin (tags)",
    "CREATE INDEX IF NOT EXISTS ix_dish_recipe_links_recipe_id ON pairing.dish_recipe_links (recipe_id)",
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dish_primary_recipe
        ON pairing.dish_recipe_links (dish_id)
        WHERE is_primary = true
    """,
    """
    DO $$
    BEGIN
        IF to_regclass('enology.dishes') IS NOT NULL THEN
            CREATE OR REPLACE VIEW pairing.v_dish_with_recipe AS
            SELECT
                d.id AS dish_id,
                d.slug AS dish_slug,
                d.name AS dish_name,
                d.category AS dish_category,
                d.suggested_wine_type,
                r.id AS recipe_id,
                r.slug AS recipe_slug,
                r.title AS recipe_title,
                r.difficulty AS recipe_difficulty,
                (r.prep_minutes + r.cook_minutes + r.rest_minutes) AS recipe_total_minutes
            FROM enology.dishes d
            LEFT JOIN pairing.dish_recipe_links drl
                ON drl.dish_id = d.id AND drl.is_primary = true
            LEFT JOIN culinary.recipes r
                ON r.id = drl.recipe_id;
        END IF;
    END $$;
    """,
)

_POSTGRES_DOWNGRADE_STATEMENTS: tuple[str, ...] = (
    "DROP VIEW IF EXISTS pairing.v_dish_with_recipe",
    "DROP TABLE IF EXISTS pairing.tag_wine_affinity",
    "DROP TABLE IF EXISTS pairing.recipe_sensory_profiles",
    "DROP TABLE IF EXISTS pairing.dish_recipe_links",
    "DROP TABLE IF EXISTS culinary.recipe_utensils",
    "DROP TABLE IF EXISTS culinary.utensils",
    "DROP TABLE IF EXISTS culinary.recipe_subrecipes",
    "DROP TABLE IF EXISTS culinary.recipe_ingredients",
    "DROP TABLE IF EXISTS culinary.recipes",
)

_MANAGED_TABLE_DROP_ORDER: tuple[str, ...] = (
    "tag_wine_affinity",
    "recipe_sensory_profiles",
    "dish_recipe_links",
    "recipe_utensils",
    "utensils",
    "recipe_subrecipes",
    "recipe_ingredients",
    "recipes",
)


def upgrade() -> None:
    """Create culinary and pairing schema tables and indexes idempotently."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in _POSTGRES_UPGRADE_STATEMENTS:
            op.execute(sa.text(stmt))
        return

    # SQLite migration path (unit tests & lightweight local runs)
    sqlite_conn = bind.execution_options(schema_translate_map=SCHEMA_TRANSLATE_SQLITE)
    Base.metadata.create_all(bind=sqlite_conn, checkfirst=True)


def downgrade() -> None:
    """Drop managed culinary and pairing schema objects."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in _POSTGRES_DOWNGRADE_STATEMENTS:
            op.execute(sa.text(stmt))
        return

    insp = inspect(bind)
    for table_name in _MANAGED_TABLE_DROP_ORDER:
        if insp.has_table(table_name):
            op.drop_table(table_name)
