-- Shared Gastronomy Ecosystem Schema (PostgreSQL 16+)
-- Bounded Contexts: culinary (Mise en Place MD), enology (Vinum Pulse), pairing (Bridge)
-- Follows ADR-0030 & PostgreSQL best practices (IDENTITY PKs, numeric money, explicit FK indexes, GIN)

CREATE SCHEMA IF NOT EXISTS culinary;
CREATE SCHEMA IF NOT EXISTS enology;
CREATE SCHEMA IF NOT EXISTS pairing;

-- =============================================================================
-- 1. CULINARY SCHEMA (Owned by Mise en Place MD)
-- =============================================================================

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
);

CREATE TABLE IF NOT EXISTS culinary.recipe_ingredients (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipe_id        bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
    position         integer NOT NULL DEFAULT 0,
    name             text NOT NULL,
    amount           numeric(10, 3),
    unit             text NOT NULL DEFAULT 'g',
    ingredient_group text NOT NULL DEFAULT 'Principal',
    is_base_weight   boolean NOT NULL DEFAULT false,
    unit_cost_eur    numeric(10, 4),
    notes            text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS culinary.recipe_subrecipes (
    parent_recipe_id bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
    child_recipe_id  bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE RESTRICT,
    name             text NOT NULL DEFAULT '',
    amount           numeric(10, 3),
    unit             text NOT NULL DEFAULT 'g',
    notes            text NOT NULL DEFAULT '',
    PRIMARY KEY (parent_recipe_id, child_recipe_id),
    CHECK (parent_recipe_id <> child_recipe_id)
);

CREATE TABLE IF NOT EXISTS culinary.utensils (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug     text NOT NULL UNIQUE,
    name     text NOT NULL,
    category text NOT NULL DEFAULT 'Cocción',
    owned    boolean NOT NULL DEFAULT true,
    specs    text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS culinary.recipe_utensils (
    recipe_id  bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
    utensil_id bigint NOT NULL REFERENCES culinary.utensils(id) ON DELETE CASCADE,
    name       text NOT NULL DEFAULT '',
    mandatory  boolean NOT NULL DEFAULT true,
    notes      text NOT NULL DEFAULT '',
    PRIMARY KEY (recipe_id, utensil_id)
);

-- =============================================================================
-- 2. ENOLOGY SCHEMA (Owned by Vinum Pulse)
-- =============================================================================

CREATE TABLE IF NOT EXISTS enology.wines (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug                  text NOT NULL UNIQUE,
    name                  text NOT NULL,
    winery                text NOT NULL,
    appellation           text NOT NULL,
    country               text NOT NULL DEFAULT 'España',
    classification        text NOT NULL DEFAULT 'D.O.',
    wine_type             text NOT NULL CHECK (wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose')),
    vintage               smallint NOT NULL CHECK (vintage BETWEEN 1900 AND 2100),
    price_eur             numeric(10, 2) NOT NULL CHECK (price_eur > 0),
    serving_temp_c        numeric(4, 1) NOT NULL,
    decant_minutes        smallint NOT NULL DEFAULT 0 CHECK (decant_minutes >= 0),
    glass_type            text NOT NULL,
    body                  numeric(4, 2) NOT NULL CHECK (body BETWEEN 1 AND 10),
    acidity               numeric(4, 2) NOT NULL CHECK (acidity BETWEEN 1 AND 10),
    tannins               numeric(4, 2) NOT NULL CHECK (tannins BETWEEN 1 AND 10),
    fruit                 numeric(4, 2) NOT NULL CHECK (fruit BETWEEN 1 AND 10),
    oak                   numeric(4, 2) NOT NULL CHECK (oak BETWEEN 1 AND 10),
    tasting_notes         text NOT NULL,
    latitude              numeric(9, 6) NOT NULL DEFAULT 40.4168,
    longitude             numeric(9, 6) NOT NULL DEFAULT -3.7038,
    altitude_m            integer NOT NULL DEFAULT 500,
    soil_type             text NOT NULL DEFAULT 'Arcilloso-calcáreo',
    climate               text NOT NULL DEFAULT 'Continental',
    aging_potential_years smallint NOT NULL DEFAULT 5,
    tagline               text NOT NULL DEFAULT '',
    image_url             text
);

CREATE TABLE IF NOT EXISTS enology.dishes (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug                text NOT NULL UNIQUE,
    name                text NOT NULL,
    category            text NOT NULL,
    description         text NOT NULL,
    body                numeric(4, 2) NOT NULL CHECK (body BETWEEN 1 AND 10),
    acidity             numeric(4, 2) NOT NULL CHECK (acidity BETWEEN 1 AND 10),
    tannins             numeric(4, 2) NOT NULL CHECK (tannins BETWEEN 1 AND 10),
    fruit               numeric(4, 2) NOT NULL CHECK (fruit BETWEEN 1 AND 10),
    oak                 numeric(4, 2) NOT NULL CHECK (oak BETWEEN 1 AND 10),
    suggested_wine_type text CHECK (suggested_wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose'))
);

CREATE TABLE IF NOT EXISTS enology.cellar_items (
    id                 text PRIMARY KEY,
    user_id            text NOT NULL DEFAULT 'sommelier',
    wine_slug          text NOT NULL REFERENCES enology.wines(slug) ON DELETE RESTRICT,
    quantity           integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    purchase_price_eur numeric(10, 2) NOT NULL DEFAULT 0.00,
    storage_location   text NOT NULL DEFAULT 'Bodega Principal',
    notes              text NOT NULL DEFAULT '',
    UNIQUE (user_id, wine_slug)
);

-- =============================================================================
-- 3. PAIRING SCHEMA (Shared Cross-App Integration Bridge)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pairing.dish_recipe_links (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dish_id      bigint NOT NULL REFERENCES enology.dishes(id) ON DELETE CASCADE,
    recipe_id    bigint NOT NULL REFERENCES culinary.recipes(id) ON DELETE CASCADE,
    is_primary   boolean NOT NULL DEFAULT false,
    match_source text NOT NULL DEFAULT 'manual' CHECK (match_source IN ('manual', 'curated', 'tag_inferred')),
    confidence   numeric(4, 3) NOT NULL DEFAULT 1.000 CHECK (confidence BETWEEN 0 AND 1),
    UNIQUE (dish_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS pairing.recipe_sensory_profiles (
    recipe_id          bigint PRIMARY KEY REFERENCES culinary.recipes(id) ON DELETE CASCADE,
    dominant_wine_type text NOT NULL CHECK (dominant_wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose')),
    body               numeric(4, 2) CHECK (body BETWEEN 1 AND 10),
    acidity            numeric(4, 2) CHECK (acidity BETWEEN 1 AND 10),
    tannins            numeric(4, 2) CHECK (tannins BETWEEN 1 AND 10),
    fruit              numeric(4, 2) CHECK (fruit BETWEEN 1 AND 10),
    oak                numeric(4, 2) CHECK (oak BETWEEN 1 AND 10),
    source             text NOT NULL DEFAULT 'inferred' CHECK (source IN ('manual', 'inferred'))
);

CREATE TABLE IF NOT EXISTS pairing.tag_wine_affinity (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword   text NOT NULL,
    wine_type text NOT NULL CHECK (wine_type IN ('Red', 'White', 'Sparkling', 'Fortified', 'Rose')),
    weight    numeric(4, 2) NOT NULL DEFAULT 1.00 CHECK (weight > 0),
    UNIQUE (keyword, wine_type)
);

-- =============================================================================
-- 4. INDEXES (Explicit FK, Composite, Partial Unique & GIN)
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe_id ON culinary.recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS ix_recipe_subrecipes_child_id   ON culinary.recipe_subrecipes (child_recipe_id);
CREATE INDEX IF NOT EXISTS ix_recipe_utensils_utensil_id   ON culinary.recipe_utensils (utensil_id);
CREATE INDEX IF NOT EXISTS ix_recipes_search_tsv           ON culinary.recipes USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS ix_recipes_tags                 ON culinary.recipes USING gin (tags);

CREATE INDEX IF NOT EXISTS ix_wines_type_price             ON enology.wines (wine_type, price_eur);
CREATE INDEX IF NOT EXISTS ix_wines_country_type_price     ON enology.wines (country, wine_type, price_eur);
CREATE INDEX IF NOT EXISTS ix_wines_appellation_price      ON enology.wines (appellation, price_eur);
CREATE INDEX IF NOT EXISTS ix_cellar_items_wine_slug       ON enology.cellar_items (wine_slug);

CREATE INDEX IF NOT EXISTS ix_dish_recipe_links_recipe_id  ON pairing.dish_recipe_links (recipe_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dish_primary_recipe
    ON pairing.dish_recipe_links (dish_id)
    WHERE is_primary = true;

-- =============================================================================
-- 5. VIEWS & DEFAULT AFFINITY SEED
-- =============================================================================

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

INSERT INTO pairing.tag_wine_affinity (keyword, wine_type, weight) VALUES
    ('carrillera', 'Red', 3.00),
    ('ibérico', 'Red', 2.50),
    ('iberico', 'Red', 2.50),
    ('ternera', 'Red', 2.50),
    ('cordero', 'Red', 3.00),
    ('caza', 'Red', 3.00),
    ('setas', 'Red', 2.00),
    ('boletus', 'Red', 2.00),
    ('trufa', 'Red', 2.00),
    ('estofado', 'Red', 2.50),
    ('guiso', 'Red', 2.00),
    ('brasa', 'Red', 2.00),
    ('fondo-oscuro', 'Red', 2.00),
    ('vino-rancio', 'Fortified', 2.50),
    ('jamón', 'Fortified', 2.50),
    ('jamon', 'Fortified', 2.50),
    ('queso-curado', 'Fortified', 2.00),
    ('chocolate', 'Fortified', 2.00),
    ('marisco', 'White', 3.00),
    ('pescado', 'White', 2.50),
    ('lubina', 'White', 3.00),
    ('rodaballo', 'White', 3.00),
    ('pulpo', 'White', 2.50),
    ('ceviche', 'White', 3.00),
    ('arroz-marinero', 'White', 2.50),
    ('ostras', 'Sparkling', 3.00),
    ('aperitivo', 'Sparkling', 2.50),
    ('fritura', 'Sparkling', 2.00),
    ('tartar', 'Sparkling', 2.00),
    ('ensalada', 'Rose', 2.00),
    ('verduras', 'Rose', 1.80),
    ('paella', 'Rose', 2.00),
    ('arroz', 'Red', 1.20),
    ('pan', 'Sparkling', 1.20),
    ('masa-madre', 'Sparkling', 1.20),
    ('postre', 'Fortified', 2.50)
ON CONFLICT (keyword, wine_type) DO NOTHING;
