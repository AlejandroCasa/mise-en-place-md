from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class UtensilCatalogItem(BaseModel):
    id: str = Field(..., description="Slug único del utensilio, ej. 'roner-sous-vide'")
    name: str = Field(..., description="Nombre del utensilio")
    category: str = Field(
        default="Cocción",
        description="Categoría: Cocción, Corte y Preparación, Precisión y Medición, Panadería y Repostería, Vanguardia, Conservación",
    )
    owned: bool = Field(
        default=True, description="Si lo tienes disponible actualmente en tu cocina"
    )
    specs: str = Field(
        default="",
        description="Especificaciones o modelo (ej. Hierro fundido 26cm, precisión 0.1g)",
    )


class RecipeUtensil(BaseModel):
    utensil_id: str = Field(..., description="ID del utensilio en el catálogo")
    name: str = Field(..., description="Nombre visible del utensilio")
    mandatory: bool = Field(default=True, description="True = Obligatorio, False = Opcional")
    notes: str = Field(
        default="",
        description="Uso específico en la receta o alternativa si es opcional (ej. 'Sustituible por olla exprés')",
    )


class Ingredient(BaseModel):
    name: str = Field(..., description="Nombre del ingrediente")
    amount: float | None = Field(default=None, description="Cantidad numérica escalable")
    unit: str = Field(
        default="g", description="Unidad (g, kg, ml, l, ud, cda, cdta, pizca, al gusto)"
    )
    group: str = Field(
        default="Principal",
        description="Agrupación de mise en place (ej. Sofrito, Masa, Emplatado)",
    )
    is_base_weight: bool = Field(
        default=False,
        description="Si forma parte del 100% de referencia para porcentaje de panadero / peso base",
    )
    unit_cost_eur: float | None = Field(
        default=None,
        ge=0,
        description="Coste unitario de referencia en EUR (€/kg, €/l o €/ud según unidad)",
    )
    notes: str = Field(
        default="", description="Corte, maduración, temperatura o calidad (ej. brunoise fina)"
    )


class Timings(BaseModel):
    prep_minutes: int = Field(
        default=0, description="Tiempo de mise en place / preparación activa (min)"
    )
    cook_minutes: int = Field(default=0, description="Tiempo de cocción (min)")
    rest_minutes: int = Field(
        default=0, description="Tiempo de reposo, fermentación, marinado o infusión (min)"
    )
    rest_notes: str = Field(
        default="", description="Detalle del reposo (ej. 18h en bloque en frío a 4°C)"
    )

    @property
    def total_minutes(self) -> int:
        return (self.prep_minutes or 0) + (self.cook_minutes or 0) + (self.rest_minutes or 0)


class TemperaturePoint(BaseModel):
    stage: str = Field(
        ..., description="Fase o elemento (ej. Horno con vapor, Sonda al corazón, Baño Roner)"
    )
    temp_c: float = Field(..., description="Temperatura en grados Celsius")
    notes: str = Field(default="", description="Notas térmicas (ej. Tiro abierto últimos 10 min)")


class SubRecipeLink(BaseModel):
    recipe_id: str = Field(..., description="Slug/ID de la sub-receta vinculada")
    name: str = Field(..., description="Nombre de la elaboración previa")
    amount: float | None = Field(default=None, description="Cantidad necesaria")
    unit: str = Field(default="g", description="Unidad")
    notes: str = Field(default="", description="Notas de aplicación")


class IterationEntry(BaseModel):
    version: str = Field(..., description="Versión (ej. v1.0, v1.1)")
    date: str = Field(..., description="Fecha ISO YYYY-MM-DD")
    changes: str = Field(..., description="Ajustes realizados y resultado obtenido")
    next_steps: str = Field(
        default="", description="Hipótesis o mejoras para la siguiente iteración"
    )
    photo: str = Field(default="", description="Ruta relativa de foto asociada a esta iteración")
    metrics: dict[str, str] = Field(
        default_factory=dict,
        description="Parámetros medidos opcionales (ej. hidratación, pH, merma)",
    )


class RecipeStep(BaseModel):
    order: int = Field(..., description="Orden del paso")
    title: str = Field(
        default="", description="Título técnico del paso (ej. Sellado Maillard, Desglasado)"
    )
    instruction: str = Field(..., description="Descripción detallada del paso")
    duration_minutes: int | None = Field(
        default=None, description="Duración en minutos para lanzar temporizador"
    )
    temp_c: float | None = Field(default=None, description="Temperatura clave en este paso (°C)")
    critical_point: str = Field(default="", description="Punto crítico de control / tip de chef")
    photo: str = Field(default="", description="Ruta relativa de foto del paso")


class GalleryPhoto(BaseModel):
    url: str = Field(..., description="Ruta relativa de la imagen")
    caption: str = Field(default="", description="Pie de foto (ej. Emplatado final en plato hondo)")


class Recipe(BaseModel):
    id: str = Field(default="", description="Identificador único (slug del archivo .md)")
    title: str = Field(..., description="Nombre del plato o elaboración")
    subtitle: str = Field(default="", description="Subtítulo o descripción corta gastronómica")
    category: str = Field(default="Principal", description="Categoría principal")
    is_subrecipe: bool = Field(
        default=False,
        description="Si es una sub-receta / elaboración base (fondo, salsa madre, masa, aceite)",
    )
    difficulty: int = Field(default=3, ge=1, le=5, description="Complejidad técnica de 1 a 5")
    rating: float = Field(default=0.0, ge=0.0, le=5.0, description="Valoración personal de 0 a 5")
    servings: float = Field(default=4.0, gt=0, description="Raciones o unidades base")
    yield_unit: str = Field(
        default="raciones", description="Unidad del rendimiento (ej. raciones, kg, ml, hogazas)"
    )
    scaling_mode: Literal["servings", "bakers_pct"] = Field(
        default="servings",
        description="Modo de escalado preferido: por raciones o por porcentaje de panadero / peso base",
    )
    techniques: list[str] = Field(default_factory=list, description="Técnicas empleadas")
    tags: list[str] = Field(default_factory=list, description="Etiquetas personalizadas")
    timings: Timings = Field(default_factory=Timings)
    temperatures: list[TemperaturePoint] = Field(default_factory=list)
    utensils: list[RecipeUtensil] = Field(default_factory=list)
    subrecipes: list[SubRecipeLink] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    steps: list[RecipeStep] = Field(default_factory=list)
    plating_notes: str = Field(default="", description="Notas de emplatado, acabado y servicio")
    chef_notes: str = Field(
        default="", description="Notas técnicas generales, conservación y regeneración"
    )
    iterations: list[IterationEntry] = Field(
        default_factory=list, description="Historial de pruebas e iteraciones"
    )
    cover_photo: str = Field(default="", description="Foto principal del plato")
    gallery: list[GalleryPhoto] = Field(default_factory=list, description="Galería de fotos")
    created_at: str = Field(default="", description="Fecha de creación ISO")
    updated_at: str = Field(default="", description="Fecha de última modificación ISO")


class WineSuggestionItem(BaseModel):
    """Suggested wine summary returned from Vinum Pulse enology catalog."""

    slug: str = Field(..., description="Unique wine slug in Vinum Pulse")
    name: str = Field(..., description="Commercial wine label")
    winery: str = Field(..., description="Producing winery")
    appellation: str = Field(..., description="Protected Designation of Origin")
    country: str = Field(..., description="Producing country")
    wine_type: str = Field(
        ..., description="Wine typology (Red, White, Sparkling, Fortified, Rose)"
    )
    vintage: int = Field(..., description="Harvest vintage year")
    price_eur: float = Field(..., description="Reference bottle price in EUR")
    serving_temp_c: float = Field(..., description="Recommended serving temperature in Celsius")
    decant_minutes: int = Field(default=0, description="Recommended decanting time in minutes")
    glass_type: str = Field(..., description="Recommended glassware")
    tagline: str = Field(default="", description="Short sommelier hook")
    vinum_url: str = Field(..., description="Deep link to wine detail in Vinum Pulse")
    cellar_quantity: int = Field(
        default=0, description="Available bottle count in enology.cellar_items"
    )
    cellar_location: str = Field(default="", description="Storage rack/location in user's cellar")


class RecipeWineSuggestion(BaseModel):
    """Mid-price wine pairing recommendation for a recipe based on dominant wine typology."""

    recipe_slug: str = Field(..., description="Recipe slug")
    recipe_title: str = Field(..., description="Recipe title")
    dominant_wine_type: str = Field(..., description="Most matching or habitual wine type")
    resolution_source: Literal["linked_dish", "sensory_profile", "tag_affinity", "fallback"] = (
        Field(..., description="How the dominant wine type was determined")
    )
    median_price_eur: float = Field(..., description="Median EUR price for the dominant wine type")
    mid_price_band_eur: tuple[float, float] = Field(
        ..., description="P35-P65 mid-price EUR band used to select the recommended wine"
    )
    recommended_wine: WineSuggestionItem = Field(..., description="Primary mid-price wine match")
    alternatives: list[WineSuggestionItem] = Field(
        default_factory=list, description="Alternative mid-price wines of the same typology"
    )
    matched_keywords: list[str] = Field(
        default_factory=list, description="Culinary tags/ingredients that drove typology inference"
    )
    rationale: str = Field(..., description="Human-readable sommelier rationale")
    cellar_available_count: int = Field(
        default=0,
        description="Total compatible bottles currently stored in enology.cellar_items",
    )
    cellar_matches: list[WineSuggestionItem] = Field(
        default_factory=list,
        description="Compatible wines already present in the user's cellar",
    )


class CellarBottleSummary(BaseModel):
    """Cellar bottle inventory item joined with Vinum Pulse wine metadata."""

    wine: WineSuggestionItem
    quantity: int = Field(..., ge=0)
    purchase_price_eur: float = Field(default=0.0, ge=0)
    storage_location: str = Field(default="")
    notes: str = Field(default="")


class CellarRecipeMatch(BaseModel):
    """Ranked recipe match for a bottle selected from the user's cellar."""

    recipe_slug: str
    recipe_title: str
    category: str
    difficulty: int
    total_minutes: int
    compatibility_score: float = Field(..., ge=0.0, le=100.0)
    dominant_wine_type: str
    resolution_source: str
    matched_keywords: list[str] = Field(default_factory=list)
    rationale: str


class CellarBottleRecipesResponse(BaseModel):
    """Reverse pairing response: best recipes to cook with an opened cellar bottle."""

    bottle: CellarBottleSummary
    matches: list[CellarRecipeMatch] = Field(default_factory=list)


class MenuCourseInput(BaseModel):
    """Single course selection inside a multi-course dinner service."""

    recipe_slug: str = Field(..., min_length=1)
    servings: float = Field(default=4.0, gt=0, le=200)


class MenuPlanRequest(BaseModel):
    """Request payload for multi-course service planning."""

    courses: list[MenuCourseInput] = Field(..., min_length=1, max_length=8)
    service_time: str = Field(
        default="21:00",
        pattern=r"^\d{2}:\d{2}$",
        description="Target dinner service clock time (HH:MM)",
    )


class ShoppingListItem(BaseModel):
    """Aggregated ingredient line across courses and exploded sub-recipe DAGs."""

    name: str
    total_amount: float | None = None
    unit: str
    sources: list[str] = Field(default_factory=list)
    estimated_cost_eur: float | None = None


class MenuTimelineStep(BaseModel):
    """Reverse countdown milestone prior to target service time."""

    offset_minutes: int = Field(..., ge=0, description="Minutes before service time")
    clock_time: str = Field(..., description="Formatted HH:MM target clock time")
    kind: Literal["rest", "subrecipe", "prep", "cook", "wine_decant", "wine_chill", "service"]
    title: str
    detail: str
    course_title: str = ""


class MenuCourseSummary(BaseModel):
    """Scaled course summary with wine pairing and per-guest economics."""

    course_number: int
    recipe_slug: str
    recipe_title: str
    category: str
    servings: float
    food_cost_eur: float | None = None
    wine: WineSuggestionItem | None = None
    subrecipes_used: list[str] = Field(default_factory=list)


class MenuPlanResponse(BaseModel):
    """Complete multi-course service plan: courses, DAG shopping list, reverse timeline & costs."""

    service_time: str
    guest_count: float
    courses: list[MenuCourseSummary]
    shopping_list: list[ShoppingListItem]
    timeline: list[MenuTimelineStep]
    total_food_cost_eur: float | None = None
    total_wine_cost_eur: float | None = None
    total_menu_cost_eur: float | None = None
    cost_per_guest_eur: float | None = None


class RecipeCostSummary(BaseModel):
    """Food costing & optional paired wine cost breakdown per serving."""

    recipe_slug: str
    servings: float
    priced_ingredients: int
    total_ingredients: int
    total_food_cost_eur: float | None = None
    food_cost_per_serving_eur: float | None = None
    paired_wine_price_eur: float | None = None
    paired_wine_per_serving_eur: float | None = None
    total_cost_per_guest_eur: float | None = None


class QuickCaptureRequest(BaseModel):
    """Freeform culinary text or minimal Markdown payload for quick draft creation."""

    raw_text: str = Field(..., min_length=3, max_length=20000)
    category: str = Field(default="Principal")
    save: bool = Field(
        default=False,
        description="If true, persist draft directly in DB; otherwise return parsed draft",
    )


class DishRecipeLinkRequest(BaseModel):
    """Payload to bind a Vinum Pulse dish slug with a Mise en Place recipe slug."""

    dish_slug: str = Field(..., min_length=1, description="Dish slug in enology.dishes")
    recipe_slug: str = Field(..., min_length=1, description="Recipe slug in culinary.recipes")
    is_primary: bool = Field(
        default=True, description="Whether this recipe is the primary link for the dish"
    )
    match_source: Literal["manual", "curated", "tag_inferred"] = Field(default="manual")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class DishRecipeLinkResponse(BaseModel):
    """Persisted dish-to-recipe bridge contract."""

    dish_slug: str
    recipe_slug: str
    is_primary: bool
    match_source: str
    confidence: float
