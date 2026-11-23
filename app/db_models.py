"""SQLAlchemy 2.0 ORM models for culinary, enology (read), and pairing schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    FetchedValue,
    ForeignKey,
    Identity,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Use native PostgreSQL ARRAY(Text) / JSONB / TSVECTOR on Postgres and fallbacks on SQLite tests.
StringListType = JSON().with_variant(ARRAY(Text), "postgresql")
JsonDocType = JSON().with_variant(JSONB, "postgresql")
TSVectorType = Text().with_variant(TSVECTOR, "postgresql")
# Use BigInteger IDENTITY on Postgres and Integer PK on SQLite (autoincrement requires INTEGER).
IdType = BigInteger().with_variant(Integer, "sqlite")


def _utcnow() -> datetime:
    """Return current timezone-aware UTC timestamp."""
    return datetime.now(UTC)


class RecipeRecord(Base):
    """Persistent technical recipe in the culinary bounded context."""

    __tablename__ = "recipes"
    __table_args__ = {"schema": "culinary"}

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    subtitle: Mapped[str] = mapped_column(Text, default="", nullable=False)
    category: Mapped[str] = mapped_column(Text, default="Principal", nullable=False)
    is_subrecipe: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    difficulty: Mapped[int] = mapped_column(SmallInteger, default=3, nullable=False)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0.00"), nullable=False)
    servings: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), default=Decimal("4.00"), nullable=False
    )
    yield_unit: Mapped[str] = mapped_column(Text, default="raciones", nullable=False)
    scaling_mode: Mapped[str] = mapped_column(Text, default="servings", nullable=False)
    prep_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cook_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rest_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rest_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(StringListType, default=list, nullable=False)
    techniques: Mapped[list[str]] = mapped_column(StringListType, default=list, nullable=False)
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JsonDocType, default=list, nullable=False)
    temperatures: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonDocType, default=list, nullable=False
    )
    iterations: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonDocType, default=list, nullable=False
    )
    plating_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    chef_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    cover_photo_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    gallery: Mapped[list[dict[str, Any]]] = mapped_column(JsonDocType, default=list, nullable=False)
    search_tsv: Mapped[str | None] = mapped_column(
        TSVectorType,
        FetchedValue(),
        nullable=True,
        deferred=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    ingredients: Mapped[list[RecipeIngredientRecord]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredientRecord.position",
    )
    utensil_links: Mapped[list[RecipeUtensilRecord]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
    )
    subrecipe_links: Mapped[list[RecipeSubrecipeRecord]] = relationship(
        foreign_keys="RecipeSubrecipeRecord.parent_recipe_id",
        back_populates="parent_recipe",
        cascade="all, delete-orphan",
    )


class RecipeIngredientRecord(Base):
    """Normalized recipe ingredient row."""

    __tablename__ = "recipe_ingredients"
    __table_args__ = {"schema": "culinary"}

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit: Mapped[str] = mapped_column(Text, default="g", nullable=False)
    ingredient_group: Mapped[str] = mapped_column(Text, default="Principal", nullable=False)
    is_base_weight: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    recipe: Mapped[RecipeRecord] = relationship(back_populates="ingredients")


class RecipeSubrecipeRecord(Base):
    """Directed edge linking a parent recipe to a prerequisite sub-recipe."""

    __tablename__ = "recipe_subrecipes"
    __table_args__ = {"schema": "culinary"}

    parent_recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    child_recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, default="", nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit: Mapped[str] = mapped_column(Text, default="g", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    parent_recipe: Mapped[RecipeRecord] = relationship(
        foreign_keys=[parent_recipe_id],
        back_populates="subrecipe_links",
    )
    child_recipe: Mapped[RecipeRecord] = relationship(foreign_keys=[child_recipe_id])


class UtensilRecord(Base):
    """Kitchen utensil catalog entry."""

    __tablename__ = "utensils"
    __table_args__ = {"schema": "culinary"}

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, default="Cocción", nullable=False)
    owned: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    specs: Mapped[str] = mapped_column(Text, default="", nullable=False)


class RecipeUtensilRecord(Base):
    """Association between a recipe and required/optional utensils."""

    __tablename__ = "recipe_utensils"
    __table_args__ = {"schema": "culinary"}

    recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    utensil_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.utensils.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, default="", nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    recipe: Mapped[RecipeRecord] = relationship(back_populates="utensil_links")
    utensil: Mapped[UtensilRecord] = relationship()


class WineRecord(Base):
    """Read model for Vinum Pulse wines in the enology bounded context."""

    __tablename__ = "wines"
    __table_args__ = {"schema": "enology"}

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    winery: Mapped[str] = mapped_column(Text, nullable=False)
    appellation: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, default="España", nullable=False)
    classification: Mapped[str] = mapped_column(Text, default="D.O.", nullable=False)
    wine_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    vintage: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    price_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    serving_temp_c: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    decant_minutes: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    glass_type: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    acidity: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    tannins: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    fruit: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    oak: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    tasting_notes: Mapped[str] = mapped_column(Text, nullable=False)
    tagline: Mapped[str] = mapped_column(Text, default="", nullable=False)


class DishRecord(Base):
    """Read model for Vinum Pulse dishes in the enology bounded context."""

    __tablename__ = "dishes"
    __table_args__ = {"schema": "enology"}

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    acidity: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    tannins: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    fruit: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    oak: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    suggested_wine_type: Mapped[str | None] = mapped_column(Text, nullable=True)


class DishRecipeLinkRecord(Base):
    """Bridge linking Vinum Pulse dishes to Mise en Place MD recipes."""

    __tablename__ = "dish_recipe_links"
    __table_args__ = (
        UniqueConstraint("dish_id", "recipe_id", name="uq_dish_recipe_pair"),
        {"schema": "pairing"},
    )

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    dish_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("enology.dishes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    match_source: Mapped[str] = mapped_column(Text, default="manual", nullable=False)
    confidence: Mapped[Decimal] = mapped_column(
        Numeric(4, 3), default=Decimal("1.000"), nullable=False
    )


class RecipeSensoryProfileRecord(Base):
    """Explicit or inferred 5D sensory profile for recipes without a curated dish."""

    __tablename__ = "recipe_sensory_profiles"
    __table_args__ = {"schema": "pairing"}

    recipe_id: Mapped[int] = mapped_column(
        IdType,
        ForeignKey("culinary.recipes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    dominant_wine_type: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    acidity: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    tannins: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    fruit: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    oak: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    source: Mapped[str] = mapped_column(Text, default="inferred", nullable=False)


class TagWineAffinityRecord(Base):
    """Weighted culinary keyword-to-wine-type affinity rule."""

    __tablename__ = "tag_wine_affinity"
    __table_args__ = (
        UniqueConstraint("keyword", "wine_type", name="uq_tag_wine_affinity"),
        {"schema": "pairing"},
    )

    id: Mapped[int] = mapped_column(IdType, Identity(always=True), primary_key=True)
    keyword: Mapped[str] = mapped_column(Text, nullable=False)
    wine_type: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("1.00"), nullable=False)
