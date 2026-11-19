from __future__ import annotations
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class UtensilCatalogItem(BaseModel):
    id: str = Field(..., description="Slug único del utensilio, ej. 'roner-sous-vide'")
    name: str = Field(..., description="Nombre del utensilio")
    category: str = Field(
        default="Cocción",
        description="Categoría: Cocción, Corte y Preparación, Precisión y Medición, Panadería y Repostería, Vanguardia, Conservación"
    )
    owned: bool = Field(default=True, description="Si lo tienes disponible actualmente en tu cocina")
    specs: str = Field(default="", description="Especificaciones o modelo (ej. Hierro fundido 26cm, precisión 0.1g)")


class RecipeUtensil(BaseModel):
    utensil_id: str = Field(..., description="ID del utensilio en el catálogo")
    name: str = Field(..., description="Nombre visible del utensilio")
    mandatory: bool = Field(default=True, description="True = Obligatorio, False = Opcional")
    notes: str = Field(
        default="",
        description="Uso específico en la receta o alternativa si es opcional (ej. 'Sustituible por olla exprés')"
    )


class Ingredient(BaseModel):
    name: str = Field(..., description="Nombre del ingrediente")
    amount: Optional[float] = Field(default=None, description="Cantidad numérica escalable")
    unit: str = Field(default="g", description="Unidad (g, kg, ml, l, ud, cda, cdta, pizca, al gusto)")
    group: str = Field(default="Principal", description="Agrupación de mise en place (ej. Sofrito, Masa, Emplatado)")
    is_base_weight: bool = Field(
        default=False,
        description="Si forma parte del 100% de referencia para porcentaje de panadero / peso base"
    )
    notes: str = Field(default="", description="Corte, maduración, temperatura o calidad (ej. brunoise fina)")


class Timings(BaseModel):
    prep_minutes: int = Field(default=0, description="Tiempo de mise en place / preparación activa (min)")
    cook_minutes: int = Field(default=0, description="Tiempo de cocción (min)")
    rest_minutes: int = Field(default=0, description="Tiempo de reposo, fermentación, marinado o infusión (min)")
    rest_notes: str = Field(default="", description="Detalle del reposo (ej. 18h en bloque en frío a 4°C)")

    @property
    def total_minutes(self) -> int:
        return (self.prep_minutes or 0) + (self.cook_minutes or 0) + (self.rest_minutes or 0)


class TemperaturePoint(BaseModel):
    stage: str = Field(..., description="Fase o elemento (ej. Horno con vapor, Sonda al corazón, Baño Roner)")
    temp_c: float = Field(..., description="Temperatura en grados Celsius")
    notes: str = Field(default="", description="Notas térmicas (ej. Tiro abierto últimos 10 min)")


class SubRecipeLink(BaseModel):
    recipe_id: str = Field(..., description="Slug/ID de la sub-receta vinculada")
    name: str = Field(..., description="Nombre de la elaboración previa")
    amount: Optional[float] = Field(default=None, description="Cantidad necesaria")
    unit: str = Field(default="g", description="Unidad")
    notes: str = Field(default="", description="Notas de aplicación")


class IterationEntry(BaseModel):
    version: str = Field(..., description="Versión (ej. v1.0, v1.1)")
    date: str = Field(..., description="Fecha ISO YYYY-MM-DD")
    changes: str = Field(..., description="Ajustes realizados y resultado obtenido")
    next_steps: str = Field(default="", description="Hipótesis o mejoras para la siguiente iteración")


class RecipeStep(BaseModel):
    order: int = Field(..., description="Orden del paso")
    title: str = Field(default="", description="Título técnico del paso (ej. Sellado Maillard, Desglasado)")
    instruction: str = Field(..., description="Descripción detallada del paso")
    duration_minutes: Optional[int] = Field(default=None, description="Duración en minutos para lanzar temporizador")
    temp_c: Optional[float] = Field(default=None, description="Temperatura clave en este paso (°C)")
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
        description="Si es una sub-receta / elaboración base (fondo, salsa madre, masa, aceite)"
    )
    difficulty: int = Field(default=3, ge=1, le=5, description="Complejidad técnica de 1 a 5")
    rating: float = Field(default=0.0, ge=0.0, le=5.0, description="Valoración personal de 0 a 5")
    servings: float = Field(default=4.0, gt=0, description="Raciones o unidades base")
    yield_unit: str = Field(default="raciones", description="Unidad del rendimiento (ej. raciones, kg, ml, hogazas)")
    scaling_mode: Literal["servings", "bakers_pct"] = Field(
        default="servings",
        description="Modo de escalado preferido: por raciones o por porcentaje de panadero / peso base"
    )
    techniques: List[str] = Field(default_factory=list, description="Técnicas empleadas")
    tags: List[str] = Field(default_factory=list, description="Etiquetas personalizadas")
    timings: Timings = Field(default_factory=Timings)
    temperatures: List[TemperaturePoint] = Field(default_factory=list)
    utensils: List[RecipeUtensil] = Field(default_factory=list)
    subrecipes: List[SubRecipeLink] = Field(default_factory=list)
    ingredients: List[Ingredient] = Field(default_factory=list)
    steps: List[RecipeStep] = Field(default_factory=list)
    plating_notes: str = Field(default="", description="Notas de emplatado, acabado y servicio")
    chef_notes: str = Field(default="", description="Notas técnicas generales, conservación y regeneración")
    iterations: List[IterationEntry] = Field(default_factory=list, description="Historial de pruebas e iteraciones")
    cover_photo: str = Field(default="", description="Foto principal del plato")
    gallery: List[GalleryPhoto] = Field(default_factory=list, description="Galería de fotos")
    created_at: str = Field(default="", description="Fecha de creación ISO")
    updated_at: str = Field(default="", description="Fecha de última modificación ISO")
