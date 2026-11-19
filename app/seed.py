from __future__ import annotations
from app.models import (
    Recipe,
    UtensilCatalogItem,
    RecipeUtensil,
    Ingredient,
    Timings,
    TemperaturePoint,
    SubRecipeLink,
    IterationEntry,
    RecipeStep,
)
from app.storage import (
    UTENSILS_FILE,
    RECIPES_DIR,
    save_utensils,
    save_recipe,
    ensure_directories,
)


def seed_initial_data() -> None:
    ensure_directories()

    if not UTENSILS_FILE.exists():
        default_utensils = [
            UtensilCatalogItem(
                id="cuchillo-cebollero-21",
                name="Cuchillo de Chef / Cebollero 21cm",
                category="Corte y Preparación",
                owned=True,
                specs="Hoja forjada afilada a 15°",
            ),
            UtensilCatalogItem(
                id="bascula-precision",
                name="Báscula de Precisión (0.1g)",
                category="Precisión y Medición",
                owned=True,
                specs="Capacidad 3kg, resolución 0.1g para hidrocoloides, sal y levaduras",
            ),
            UtensilCatalogItem(
                id="sonda-termometro",
                name="Termómetro Sonda Digital de Lectura Instantánea",
                category="Precisión y Medición",
                owned=True,
                specs="Rango -50°C a 300°C, aguja fina",
            ),
            UtensilCatalogItem(
                id="cocotte-hierro-26",
                name="Cocotte / Olla de Hierro Fundido Esmaltado (26cm)",
                category="Cocción",
                owned=True,
                specs="Alta inercia térmica, apta para horno a 260°C",
            ),
            UtensilCatalogItem(
                id="sarten-acero-mineral",
                name="Sartén de Acero al Carbono / Hierro Mineral",
                category="Cocción",
                owned=True,
                specs="28cm curada para reacciones de Maillard intensas",
            ),
            UtensilCatalogItem(
                id="roner-sous-vide",
                name="Circulador de Inmersión (Roner / Sous-Vide)",
                category="Vanguardia",
                owned=True,
                specs="Estabilidad ±0.05°C hasta 95°C",
            ),
            UtensilCatalogItem(
                id="envasadora-vacio",
                name="Envasadora al Vacío",
                category="Conservación",
                owned=True,
                specs="Sellado doble para bolsas de cocción y marinados",
            ),
            UtensilCatalogItem(
                id="sifon-espumas",
                name="Sifón de Espumas (0.5L)",
                category="Vanguardia",
                owned=True,
                specs="Cabezal de acero inoxidable, apto baño maría hasta 75°C",
            ),
            UtensilCatalogItem(
                id="chino-estamena",
                name="Colador Chino + Estameña de Algodón",
                category="Corte y Preparación",
                owned=True,
                specs="Malla extrafina para clarificar fondos y aceites",
            ),
            UtensilCatalogItem(
                id="banneton-fermentacion",
                name="Banneton de Ratán (25cm)",
                category="Panadería y Repostería",
                owned=True,
                specs="Con tela de lino para fermentación en bloque/formado",
            ),
            UtensilCatalogItem(
                id="rasqueta-panadero",
                name="Rasqueta Trapezoidal y Cuchilla Lame",
                category="Panadería y Repostería",
                owned=True,
                specs="Acero inoxidable y hoja curva para greñado",
            ),
            UtensilCatalogItem(
                id="soplete-cocina",
                name="Soplete de Cocina de Llama Directa",
                category="Cocción",
                owned=True,
                specs="Para acabados, lacados y tostado puntual",
            ),
            UtensilCatalogItem(
                id="robot-triturador-potente",
                name="Robot Termomix / Batidora de Vaso de Alta Potencia",
                category="Corte y Preparación",
                owned=True,
                specs="Emulsiones a 70°C y purés sedosos sin fibra",
            ),
            UtensilCatalogItem(
                id="ahumador-frio",
                name="Pipa de Ahumado en Frío",
                category="Vanguardia",
                owned=False,
                specs="Viruta de haya o roble bajo campana",
            ),
        ]
        save_utensils(default_utensils)

    existing_files = list(RECIPES_DIR.glob("*.md"))
    if existing_files:
        return

    # 1. Sub-receta: Fondo Oscuro de Ternera Tostado (Demi-Glace Ligera)
    fondo = Recipe(
        id="fondo-oscuro-ternera-tostado",
        title="Fondo Oscuro de Ternera Tostado y Vino Rancio",
        subtitle="Elaboración madre de colágeno natural y tueste profundo sin harinas añadidas",
        category="Fondo / Base",
        is_subrecipe=True,
        difficulty=3,
        rating=4.9,
        servings=1500,
        yield_unit="ml",
        scaling_mode="servings",
        techniques=["Tostado Maillard", "Extracción lenta", "Desglasado", "Decantación y clarificado"],
        tags=["fondo", "base", "colágeno", "carnes", "arroz"],
        timings=Timings(
            prep_minutes=35,
            cook_minutes=360,
            rest_minutes=720,
            rest_notes="12h en cámara a 3°C para solidificar la capa grasa superior y desgrasar en frío",
        ),
        temperatures=[
            TemperaturePoint(stage="Horno (Tostado de huesos)", temp_c=210, notes="Convección seca hasta dorado caoba"),
            TemperaturePoint(stage="Hervor de extracción (Simmer)", temp_c=92, notes="Fremissement: burbuja mínima constante sin ebullición violenta"),
            TemperaturePoint(stage="Abatimiento / Reposo", temp_c=3, notes="Desgrasado en bloque sólido"),
        ],
        utensils=[
            RecipeUtensil(
                utensil_id="cocotte-hierro-26",
                name="Cocotte / Olla de Hierro Fundido Esmaltado (26cm)",
                mandatory=True,
                notes="O marmita alta de fondo difusor grueso para mantener 92°C estables sin agarrarse",
            ),
            RecipeUtensil(
                utensil_id="chino-estamena",
                name="Colador Chino + Estameña de Algodón",
                mandatory=True,
                notes="Imprescindible para un fondo limpio, brillante y sin partículas en suspensión",
            ),
            RecipeUtensil(
                utensil_id="sonda-termometro",
                name="Termómetro Sonda Digital de Lectura Instantánea",
                mandatory=False,
                notes="Opcional: se puede controlar visualmente con burbujeo muy lento ('sonrisa' del caldo)",
            ),
        ],
        ingredients=[
            Ingredient(name="Huesos de rodilla y caña de ternera", amount=1800, unit="g", group="Base Ósea y Cárnica", is_base_weight=True, notes="Cortados a 5 cm para exponer colágeno"),
            Ingredient(name="Recortes de morcillo / jarrete de ternera", amount=700, unit="g", group="Base Ósea y Cárnica", notes="Aportan sabor cárnico y gelatina"),
            Ingredient(name="Manita de ternera o cerdo blanqueada", amount=250, unit="g", group="Base Ósea y Cárnica", notes="Clave para textura sedosa al reducir"),
            Ingredient(name="Cebolla dulce", amount=350, unit="g", group="Mirepoix Tostada", notes="En mirepoix de 3 cm con piel limpia (aporta color ámbar)"),
            Ingredient(name="Zanahoria", amount=250, unit="g", group="Mirepoix Tostada", notes="En rodajas gruesas oblicuas"),
            Ingredient(name="Apio en rama", amount=120, unit="g", group="Mirepoix Tostada", notes="Sin hojas amargas"),
            Ingredient(name="Cabeza de ajos entera", amount=1, unit="ud", group="Mirepoix Tostada", notes="Cortada transversalmente a la mitad"),
            Ingredient(name="Concentrado doble de tomate", amount=45, unit="g", group="Umami y Desglasado", notes="Pincelado sobre los huesos los últimos 15 min de horno"),
            Ingredient(name="Vino Oloroso seco o Vino Rancio", amount=250, unit="ml", group="Umami y Desglasado", notes="Para desglasar las bandejas de asado"),
            Ingredient(name="Agua mineral de mineralización débil fría", amount=4500, unit="ml", group="Extracción", notes="Siempre partir de agua fría"),
            Ingredient(name="Pimienta negra en grano, tomillo fresco y laurel", amount=8, unit="g", group="Bouquet Garni", notes="Infusionar solo la última hora"),
        ],
        steps=[
            RecipeStep(
                order=1,
                title="Tostado profundo de huesos y carne",
                instruction="Disponer los huesos y recortes de jarrete en una sola capa sobre bandeja de horno sin amontonar. Hornear a 210°C durante 40 minutos volteando a mitad de cocción hasta lograr un color caoba uniforme sin zonas carbonizadas.",
                duration_minutes=40,
                temp_c=210,
                critical_point="Si se queman los bordes el fondo amargará al reducir; buscar caoba brillante.",
            ),
            RecipeStep(
                order=2,
                title="Caramelización de mirepoix y pinçage de tomate",
                instruction="Pincelar los huesos con el concentrado de tomate e incorporar la mirepoix de verduras en la bandeja. Hornear 15-20 minutos adicionales hasta que los azúcares del tomate oscurezcan.",
                duration_minutes=18,
                temp_c=200,
                critical_point="El pinçage del tomate multiplica el glutamato natural y el tono rubí oscuro.",
            ),
            RecipeStep(
                order=3,
                title="Desglasado con Oloroso y arranque en frío",
                instruction="Pasar huesos y verduras a la marmita retirando el exceso de grasa fundida. Desglasar la bandeja caliente con el vino Oloroso raspando todos los sucs caramelizados, reducir a la mitad y volcar a la olla. Cubrir con el agua fría.",
                duration_minutes=10,
            ),
            RecipeStep(
                order=4,
                title="Extracción lenta (Fremissement)",
                instruction="Llevar suavemente a 92°C y espumar con cacillo todas las impurezas proteicas durante los primeros 30 minutos. Mantener a 90-92°C destapado durante 5 horas y media. Añadir el bouquet garni en la última hora.",
                duration_minutes=330,
                temp_c=92,
                critical_point="Jamás hervir a borbotones o se emulsionará la grasa enturbiando el fondo.",
            ),
            RecipeStep(
                order=5,
                title="Filtrado por estameña, enfriado y reducción",
                instruction="Colar por chino y estameña húmeda sin presionar los sólidos. Enfriar rápidamente, reposar en nevera 12h, retirar el disco de grasa superior y reducir un 30% hasta textura ligeramente nappante.",
                duration_minutes=30,
                temp_c=3,
            ),
        ],
        plating_notes="Envasar en bolsas de vacío de 250 ml o 500 ml para dosificación directa en arroces secos/melosos, glaseados de carnes y salsas madre.",
        chef_notes="Sin sal añadida durante la cocción para que al reducir en un glaseado (demi-glace) no se sale el plato final.",
        iterations=[
            IterationEntry(
                version="v1.0",
                date="2026-09-12",
                changes="Versión inicial con vino tinto joven para desglasar. Buena estructura pero acidez algo marcada al reducir a demi-glace.",
                next_steps="Sustituir el tinto joven por Oloroso seco e incorporar media manita para más gelatina.",
            ),
            IterationEntry(
                version="v1.1",
                date="2026-10-04",
                changes="Sustituido por Oloroso seco + 250g de manita blanqueada. Brillo espejo espectacular y notas de frutos secos.",
                next_steps="Probar a infusionar 2g de boletus secos en los últimos 20 minutos para versión otoñal.",
            ),
        ],
    )
    save_recipe(fondo)

    # 2. Plato Principal: Arroz Meloso de Carrillera Ibérica a Baja Temperatura y Trompetas de la Muerte
    arroz = Recipe(
        id="arroz-meloso-carrillera-setas",
        title="Arroz Meloso de Carrillera Ibérica 68°C y Trompetas de la Muerte",
        subtitle="Grano Bombita o Senia ligado con colágeno natural de carrillera glaseada y emulsión de ajo asado",
        category="Principal",
        is_subrecipe=False,
        difficulty=4,
        rating=5.0,
        servings=4,
        yield_unit="raciones",
        scaling_mode="servings",
        techniques=["Baja temperatura (Sous-vide)", "Sofrito de larga cocción", "Nacrado de grano", "Mantecado por colágeno"],
        tags=["arroz", "meloso", "ibérico", "setas", "otoño", "baja-temperatura"],
        timings=Timings(
            prep_minutes=40,
            cook_minutes=25,
            rest_minutes=3,
            rest_notes="3 minutos de reposo fuera del fuego antes de servir (más las 16h previas de roner si se hace sous-vide)",
        ),
        temperatures=[
            TemperaturePoint(stage="Baño Roner (Carrillera Sous-Vide)", temp_c=68, notes="16 horas para fundir colágeno manteniendo jugosidad fibrilar"),
            TemperaturePoint(stage="Fondo de infusión en cazo", temp_c=95, notes="El fondo debe entrar siempre hirviendo al arroz"),
            TemperaturePoint(stage="Emulsión final (Mantecado)", temp_c=65, notes="Fuera del fuego para no cortar la grasa de ajo asado"),
        ],
        utensils=[
            RecipeUtensil(
                utensil_id="cocotte-hierro-26",
                name="Cocotte / Olla de Hierro Fundido Esmaltado (26cm)",
                mandatory=True,
                notes="O cazuela ancha de hierro para reparto homogéneo del calor en el meloso",
            ),
            RecipeUtensil(
                utensil_id="cuchillo-cebollero-21",
                name="Cuchillo de Chef / Cebollero 21cm",
                mandatory=True,
                notes="Para brunoise milimétrica de chalota y limpieza de aponeurosis",
            ),
            RecipeUtensil(
                utensil_id="roner-sous-vide",
                name="Circulador de Inmersión (Roner / Sous-Vide)",
                mandatory=False,
                notes="Sustituible por estofado tradicional en cocotte a 140°C (2.5h) u olla exprés (35 min)",
            ),
            RecipeUtensil(
                utensil_id="envasadora-vacio",
                name="Envasadora al Vacío",
                mandatory=False,
                notes="Solo necesaria si se cocina la carrillera en Roner",
            ),
            RecipeUtensil(
                utensil_id="soplete-cocina",
                name="Soplete de Cocina de Llama Directa",
                mandatory=False,
                notes="Para caramelizar ligeramente la superficie de la carrillera glaseada al emplatar",
            ),
        ],
        subrecipes=[
            SubRecipeLink(
                recipe_id="fondo-oscuro-ternera-tostado",
                name="Fondo Oscuro de Ternera Tostado y Vino Rancio",
                amount=1280,
                unit="ml",
                notes="Proporción 3.5 : 1 respecto al peso del arroz + 150 ml para glasear la carrillera",
            )
        ],
        ingredients=[
            Ingredient(name="Arroz variedad Albufera o Senia", amount=320, unit="g", group="Arroz y Caldo", is_base_weight=True, notes="80g por comensal; absorbe sabor manteniendo centro al dente"),
            Ingredient(name="Carrilleras de cerdo ibérico limpias", amount=600, unit="g", group="Proteína Principal", notes="Sin telilla plateada exterior"),
            Ingredient(name="Trompetas de la muerte frescas (Craterellus cornucopioides)", amount=180, unit="g", group="Setas y Sofrito", notes="Limpias con pincel, sin sumergir en agua"),
            Ingredient(name="Boletus edulis en dados de 1.5 cm", amount=150, unit="g", group="Setas y Sofrito", notes="Dorar fuerte por separado"),
            Ingredient(name="Chalota", amount=140, unit="g", group="Setas y Sofrito", notes="Brunoise muy fina, pochada 45 min hasta color caramelo"),
            Ingredient(name="Tomate pera rallado sin semillas", amount=90, unit="g", group="Setas y Sofrito", notes="Reducido hasta textura de mermelada seca"),
            Ingredient(name="Pimentón de la Vera ahumado agridulce", amount=3, unit="g", group="Setas y Sofrito", notes="Infusionar 5 segundos fuera del fuego"),
            Ingredient(name="Ajo negro o ajo asado en camisa", amount=25, unit="g", group="Acabado y Emulsión", notes="Emulsionado con 40 ml de AOVE Arbequina"),
            Ingredient(name="Mantequilla noisette o grasa de tuétano", amount=25, unit="g", group="Acabado y Emulsión", notes="Para mantecar los últimos 2 minutos"),
            Ingredient(name="Sal fina y pimienta negra recién molida", amount=8, unit="g", group="Condimento", notes="Ajustar tras probar el fondo reducido"),
        ],
        steps=[
            RecipeStep(
                order=1,
                title="Cocción de la carrillera (Sous-vide o Estofado)",
                instruction="Marcar las carrilleras salpimentadas en sartén de hierro humeante 45 segundos por cara. Envasar con 100 ml de Fondo Oscuro y una rama de tomillo a 68°C durante 16h (o estofar de forma tradicional). Reservar los jugos colados y cortar la carrillera en medallones gruesos.",
                duration_minutes=15,
                temp_c=68,
                critical_point="Recuperar todo el jugo gelatinoso de la bolsa e integrarlo al fondo del arroz.",
            ),
            RecipeStep(
                order=2,
                title="Sofrito oscuro de chalota y salteado de setas",
                instruction="En la cocotte, pochar la chalota a fuego lento hasta tono caoba. Incorporar el ajo picado, el pimentón fuera del fuego y el tomate rallado, reduciendo hasta que se separe el aceite. Saltear aparte los boletus y la mitad de las trompetas a fuego vivo.",
                duration_minutes=20,
                critical_point="El sofrito debe quedar completamente deshidratado antes de nacrar el arroz.",
            ),
            RecipeStep(
                order=3,
                title="Nacrado del grano",
                instruction="Añadir el arroz Albufera y nacrar durante 2 minutos removiendo constantemente hasta que los bordes del grano se vuelvan translúcidos.",
                duration_minutes=2,
            ),
            RecipeStep(
                order=4,
                title="Cocción por adición de Fondo Oscuro hirviendo",
                instruction="Verter el Fondo Oscuro de Ternera hirviendo (en proporción 3.5 partes de caldo por 1 de arroz). Cocinar 12 minutos a fuego medio-alto y 4 minutos a fuego suave, moviendo la cazuela en vaivén para liberar almidón.",
                duration_minutes=16,
                temp_c=95,
                critical_point="En el minuto 13 incorporar los boletus salteados y las trompetas para que infusione el aroma de bosque.",
            ),
            RecipeStep(
                order=5,
                title="Mantecado, glaseado y reposo",
                instruction="Retirar del fuego al minuto 16 con el grano aún entero en su núcleo. Ligar en vaivén con la mantequilla noisette. Disponer encima los medallones de carrillera lacados con su propio jugo reducido y sopletear ligeramente. Reposar 3 minutos.",
                duration_minutes=3,
                temp_c=65,
            ),
        ],
        plating_notes="Servir en plato hondo precalentado. El arroz debe extenderse lentamente con ola cremosa (no caldoso ni seco). Terminar con puntos de emulsión de ajo asado, trompetas crujientes y cebollino recién cortado.",
        chef_notes="Si se utiliza arroz Bomba en lugar de Albufera/Senia, subir la proporción de fondo de 3.5:1 a 4:1 y alargar 2 minutos la cocción.",
        iterations=[
            IterationEntry(
                version="v1.0",
                date="2026-10-08",
                changes="Probado con arroz Bomba a proporción 3.5:1. Quedó ligeramente corto de caldo al reposar.",
                next_steps="Cambiar a variedad Albufera (mejor transmisión de colágeno al almidón) o subir caldo a 3.8:1.",
            ),
            IterationEntry(
                version="v1.2",
                date="2026-10-18",
                changes="Arroz Albufera 3.5:1 con 25g de mantequilla noisette al final. Textura aterciopelada perfecta.",
                next_steps="Añadir ralladura mínima de castaña cruda en el emplatado.",
            ),
        ],
    )
    save_recipe(arroz)

    # 3. Panadería Técnica: Hogaza de Masa Madre al 78% de Hidratación (Escalado por Porcentaje de Panadero)
    hogaza = Recipe(
        id="hogaza-masa-madre-alta-hidratacion",
        title="Hogaza Rústica de Masa Madre al 78% de Hidratación",
        subtitle="Fermentación retardada de 18h a 4°C con 20% de trigo integral molido a la piedra y centeno",
        category="Panadería / Masa",
        is_subrecipe=False,
        difficulty=4,
        rating=4.8,
        servings=2,
        yield_unit="hogazas (880g)",
        scaling_mode="bakers_pct",
        techniques=["Autólisis", "Pliegues en bobina (Coil Folds)", "Fermentación en frío", "Horneado con vapor en hierro"],
        tags=["pan", "masa-madre", "fermentación", "panadería", "alta-hidratación"],
        timings=Timings(
            prep_minutes=45,
            cook_minutes=42,
            rest_minutes=1140,
            rest_notes="1h autólisis + 3.5h fermentación en bloque a 25°C + 14.5h retardo en frío a 4°C",
        ),
        temperatures=[
            TemperaturePoint(stage="Temperatura Deseada de la Masa (TDM)", temp_c=25.5, notes="Ajustar temperatura del agua para clavar la fermentación en bloque"),
            TemperaturePoint(stage="Retardo en Cámara", temp_c=4, notes="Frena las levaduras y potencia ácidos orgánicos lácticos/acéticos"),
            TemperaturePoint(stage="Horno + Cocotte tapada (Vapor)", temp_c=250, notes="Primeros 20 minutos para máxima expansión (Oven Spring)"),
            TemperaturePoint(stage="Horno sin tapa (Corteza) / Corazón", temp_c=98, notes="220°C ambiente hasta alcanzar 98°C en el centro de la miga"),
        ],
        utensils=[
            RecipeUtensil(
                utensil_id="bascula-precision",
                name="Báscula de Precisión (0.1g)",
                mandatory=True,
                notes="Indispensable para respetar los porcentajes de panadero e hidratación exacta",
            ),
            RecipeUtensil(
                utensil_id="cocotte-hierro-26",
                name="Cocotte / Olla de Hierro Fundido Esmaltado (26cm)",
                mandatory=True,
                notes="Retiene el vapor propio de la masa simulando un horno de solera con inyección de vapor",
            ),
            RecipeUtensil(
                utensil_id="banneton-fermentacion",
                name="Banneton de Ratán (25cm)",
                mandatory=False,
                notes="Sustituible por un bol hondo forrado con un paño de lino enharinado con harina de arroz",
            ),
            RecipeUtensil(
                utensil_id="rasqueta-panadero",
                name="Rasqueta Trapezoidal y Cuchilla Lame",
                mandatory=False,
                notes="Sustituible por cuchillo de sierra muy afilado o cuchilla de afeitar nueva",
            ),
            RecipeUtensil(
                utensil_id="sonda-termometro",
                name="Termómetro Sonda Digital de Lectura Instantánea",
                mandatory=True,
                notes="Para controlar la TDM (25.5°C) tras el mezclado y los 98°C de miga al salir del horno",
            ),
        ],
        ingredients=[
            Ingredient(name="Harina panadera de fuerza media (W280-300)", amount=800, unit="g", group="Harinas (Base 100%)", is_base_weight=True, notes="80% del peso total de harina"),
            Ingredient(name="Harina de trigo integral ecológica", amount=150, unit="g", group="Harinas (Base 100%)", is_base_weight=True, notes="15% del peso total de harina"),
            Ingredient(name="Harina de centeno integral", amount=50, unit="g", group="Harinas (Base 100%)", is_base_weight=True, notes="5% del peso total de harina"),
            Ingredient(name="Agua filtrada (78% hidratación)", amount=780, unit="g", group="Fórmula Panadera", is_base_weight=False, notes="Reservar 50g para el bassinage con la sal"),
            Ingredient(name="Masa Madre activa al 100% de hidratación (20%)", amount=200, unit="g", group="Fórmula Panadera", is_base_weight=False, notes="Usar en su pico máximo de volumen (triplicada)"),
            Ingredient(name="Sal marina fina sin refinar (2.1%)", amount=21, unit="g", group="Fórmula Panadera", is_base_weight=False, notes="Incorporar tras la autólisis"),
        ],
        steps=[
            RecipeStep(
                order=1,
                title="Autólisis fermentativa (60 min)",
                instruction="Mezclar las tres harinas (1000g totales = 100%) con 730g de agua y los 200g de masa madre activa hasta que no queden restos de harina seca. Cubrir y reposar 60 minutos a 25°C.",
                duration_minutes=60,
                temp_c=25.5,
                critical_point="La hidratación enzimática previa desarrolla el gluten sin oxidar los pigmentos ni aromas del trigo.",
            ),
            RecipeStep(
                order=2,
                title="Incorporación de sal y Bassinage",
                instruction="Añadir los 21g de sal y los 50g de agua reservados poco a poco mediante pellizcos y amasado Rubaud en el bol durante 5 minutos hasta que la masa se despegue de las paredes.",
                duration_minutes=8,
            ),
            RecipeStep(
                order=3,
                title="Fermentación en bloque y Pliegues en Bobina (Coil Folds)",
                instruction="Mantener la masa a 25-26°C durante 3 horas y media. Realizar 4 tandas de pliegues en bobina (coil folds) cada 35 minutos durante las primeras 2 horas. Dejar descansar sin tocar la última hora y media hasta que aumente un 45-50% de volumen.",
                duration_minutes=210,
                temp_c=25.5,
                critical_point="Guiarse por el porcentaje de crecimiento en alícuota (45%), no solo por el reloj.",
            ),
            RecipeStep(
                order=4,
                title="División, preformado, formado y retardo en frío",
                instruction="Dividir en 2 piezas de ~980g. Bolear suavemente, reposar 25 min en mesa y formar con tensión superficial. Pasar a bannetons espolvoreados con harina de arroz y refrigerar a 4°C durante 14-16 horas.",
                duration_minutes=30,
                temp_c=4,
            ),
            RecipeStep(
                order=5,
                title="Greñado y horneado en Cocotte al vapor",
                instruction="Precalentar el horno con la cocotte dentro a 250°C durante 45 minutos. Volcar la hogaza fría sobre papel, greñar a 30° de inclinación con cuchilla lame e introducir en la cocotte tapada 20 minutos a 250°C. Destapar, bajar a 220°C y hornear 22 minutos más hasta corteza bien caramelizada.",
                duration_minutes=42,
                temp_c=250,
                critical_point="No cortar el pan hasta que enfríe al menos 90 minutos sobre rejilla para que gelifique la miga.",
            ),
        ],
        plating_notes="Corteza crujiente con ampollas de fermentación (blistering), oreja pronunciada y alveolado abierto nacarado.",
        chef_notes="El modo 'Porcentaje de Panadero' permite escalar el peso total de harina (100%) al tamaño exacto de tu banneton manteniendo el 78% de agua, 20% de masa madre y 2.1% de sal.",
        iterations=[
            IterationEntry(
                version="v1.0",
                date="2026-09-28",
                changes="Hidratación al 74% con 100% harina blanca. Alveolado regular pero corteza menos aromática.",
                next_steps="Subir hidratación al 78% e introducir 15% trigo integral + 5% centeno.",
            ),
            IterationEntry(
                version="v1.1",
                date="2026-10-15",
                changes="78% hidratación con bassinage de 50g. Gran salto en extensibilidad y sabor láctico complejo.",
                next_steps="Probar inclusión de 12% de nueces tostadas y romero tras el segundo coil fold.",
            ),
        ],
    )
    save_recipe(hogaza)
