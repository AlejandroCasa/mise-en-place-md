"""Add optional unit_cost_eur column to culinary.recipe_ingredients for food costing.

Revision ID: 0002_ingredient_unit_cost
Revises: 0001_baseline
Create Date: 2026-11-25 22:05:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_ingredient_unit_cost"
down_revision: str | Sequence[str] | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add unit_cost_eur column to recipe_ingredients idempotently."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                "ALTER TABLE culinary.recipe_ingredients "
                "ADD COLUMN IF NOT EXISTS unit_cost_eur numeric(10, 4)"
            )
        )
        return

    insp = inspect(bind)
    if insp.has_table("recipe_ingredients"):
        cols = {col["name"] for col in insp.get_columns("recipe_ingredients")}
        if "unit_cost_eur" not in cols:
            op.add_column(
                "recipe_ingredients",
                sa.Column("unit_cost_eur", sa.Numeric(10, 4), nullable=True),
            )


def downgrade() -> None:
    """Remove unit_cost_eur column from recipe_ingredients."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text("ALTER TABLE culinary.recipe_ingredients DROP COLUMN IF EXISTS unit_cost_eur")
        )
        return

    insp = inspect(bind)
    if insp.has_table("recipe_ingredients"):
        cols = {col["name"] for col in insp.get_columns("recipe_ingredients")}
        if "unit_cost_eur" in cols:
            with op.batch_alter_table("recipe_ingredients") as batch_op:
                batch_op.drop_column("unit_cost_eur")
