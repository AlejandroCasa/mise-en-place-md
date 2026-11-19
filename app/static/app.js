// Estado global de la aplicación
let allRecipes = [];
let filteredRecipes = [];
let utensilsCatalog = [];
let activeRecipeId = null;
let currentScaleFactor = 1.0;
let currentViewScalingMode = null; // 'servings' | 'bakers_pct'
let checkedIngredients = new Set();
let checkedSteps = new Set();
let activeTimers = [];
let timerInterval = null;
let wakeLockSentinel = null;

// Inicialización
document.addEventListener("DOMContentLoaded", async () => {
  await loadInitialData();
});

async function loadInitialData(selectId = null) {
  const [recipesRes, utensilsRes] = await Promise.all([
    fetch("/api/recipes"),
    fetch("/api/utensils"),
  ]);
  allRecipes = await recipesRes.json();
  utensilsCatalog = await utensilsRes.json();

  updateUtensilHeaderCounter();
  populateFilterDropdowns();
  applyFilters();

  if (selectId && allRecipes.some((r) => r.id === selectId)) {
    selectRecipe(selectId);
  } else if (activeRecipeId && allRecipes.some((r) => r.id === activeRecipeId)) {
    selectRecipe(activeRecipeId);
  } else if (filteredRecipes.length > 0) {
    selectRecipe(filteredRecipes[0].id);
  } else {
    renderEmptyState();
  }
}

function getUtensilMap() {
  const map = {};
  for (const u of utensilsCatalog) {
    map[u.id] = u;
  }
  return map;
}

function updateUtensilHeaderCounter() {
  const ownedCount = utensilsCatalog.filter((u) => u.owned).length;
  const el = document.getElementById("header-utensil-count");
  if (el) {
    el.textContent = `${ownedCount}/${utensilsCatalog.length}`;
  }
}

function populateFilterDropdowns() {
  const catSelect = document.getElementById("filter-category");
  const utSelect = document.getElementById("filter-utensil");
  const techSelect = document.getElementById("filter-technique");

  const currentCat = catSelect.value;
  const currentUt = utSelect.value;
  const currentTech = techSelect.value;

  const categories = Array.from(new Set(allRecipes.map((r) => r.category).filter(Boolean))).sort();
  catSelect.innerHTML = `<option value="">Todas las categorías</option>` +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  catSelect.value = currentCat;

  const sortedUtensils = [...utensilsCatalog].sort((a, b) => a.name.localeCompare(b.name));
  utSelect.innerHTML = `<option value="">Cualquier utensilio</option>` +
    sortedUtensils.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} ${u.owned ? "✓" : "(No disp.)"}</option>`).join("");
  utSelect.value = currentUt;

  const techniques = Array.from(
    new Set(allRecipes.flatMap((r) => r.techniques || []).filter(Boolean))
  ).sort();
  techSelect.innerHTML = `<option value="">Todas las técnicas</option>` +
    techniques.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  techSelect.value = currentTech;
}

// Comprueba si todos los utensilios obligatorios de una receta están disponibles en la cocina
function checkRecipeEquipmentStatus(recipe) {
  const uMap = getUtensilMap();
  const mandatoryList = (recipe.utensils || []).filter((u) => u.mandatory);
  const optionalList = (recipe.utensils || []).filter((u) => !u.mandatory);

  const missingMandatory = mandatoryList.filter((u) => {
    const catItem = uMap[u.utensil_id];
    return catItem ? !catItem.owned : false;
  });

  const missingOptional = optionalList.filter((u) => {
    const catItem = uMap[u.utensil_id];
    return catItem ? !catItem.owned : false;
  });

  return {
    canCookMandatory: missingMandatory.length === 0,
    missingMandatory,
    missingOptional,
    mandatoryCount: mandatoryList.length,
    optionalCount: optionalList.length,
  };
}

function applyFilters() {
  const q = (document.getElementById("filter-search")?.value || "").trim().toLowerCase();
  const cookableToday = document.getElementById("filter-cookable-today")?.checked || false;
  const ingIncludeRaw = (document.getElementById("filter-ing-include")?.value || "").toLowerCase();
  const ingExcludeRaw = (document.getElementById("filter-ing-exclude")?.value || "").toLowerCase();
  const cat = document.getElementById("filter-category")?.value || "";
  const subType = document.getElementById("filter-subrecipe")?.value || "all";
  const utensilId = document.getElementById("filter-utensil")?.value || "";
  const technique = document.getElementById("filter-technique")?.value || "";
  const sortBy = document.getElementById("sort-by")?.value || "updated_desc";

  const includeTerms = ingIncludeRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const excludeTerms = ingExcludeRaw.split(",").map((s) => s.trim()).filter(Boolean);

  filteredRecipes = allRecipes.filter((r) => {
    // Texto general
    if (q) {
      const haystack = [
        r.title,
        r.subtitle,
        r.category,
        ...(r.tags || []),
        ...(r.techniques || []),
        r.chef_notes,
        r.plating_notes,
        ...(r.ingredients || []).map((i) => i.name),
        ...(r.utensils || []).map((u) => u.name),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Solo cocinables hoy con utensilios obligatorios en inventario
    if (cookableToday) {
      const status = checkRecipeEquipmentStatus(r);
      if (!status.canCookMandatory) return false;
    }

    // Ingredientes incluidos
    if (includeTerms.length > 0) {
      const ingText = (r.ingredients || []).map((i) => `${i.name} ${i.notes}`).join(" ").toLowerCase();
      for (const term of includeTerms) {
        if (!ingText.includes(term)) return false;
      }
    }

    // Ingredientes excluidos
    if (excludeTerms.length > 0) {
      const ingText = (r.ingredients || []).map((i) => `${i.name} ${i.notes}`).join(" ").toLowerCase();
      for (const term of excludeTerms) {
        if (ingText.includes(term)) return false;
      }
    }

    // Categoría
    if (cat && r.category !== cat) return false;

    // Tipo (Plato final vs Sub-receta)
    if (subType === "main" && r.is_subrecipe) return false;
    if (subType === "sub" && !r.is_subrecipe) return false;

    // Utensilio específico
    if (utensilId) {
      const hasUtensil = (r.utensils || []).some((u) => u.utensil_id === utensilId);
      if (!hasUtensil) return false;
    }

    // Técnica específica
    if (technique) {
      const hasTech = (r.techniques || []).includes(technique);
      if (!hasTech) return false;
    }

    return true;
  });

  // Ordenación
  filteredRecipes.sort((a, b) => {
    const activeA = (a.timings?.prep_minutes || 0) + (a.timings?.cook_minutes || 0);
    const activeB = (b.timings?.prep_minutes || 0) + (b.timings?.cook_minutes || 0);
    const totalA = activeA + (a.timings?.rest_minutes || 0);
    const totalB = activeB + (b.timings?.rest_minutes || 0);

    switch (sortBy) {
      case "rating_desc":
        return (b.rating || 0) - (a.rating || 0);
      case "difficulty_asc":
        return (a.difficulty || 1) - (b.difficulty || 1);
      case "difficulty_desc":
        return (b.difficulty || 1) - (a.difficulty || 1);
      case "active_time_asc":
        return activeA - activeB;
      case "total_time_asc":
        return totalA - totalB;
      case "title_asc":
        return a.title.localeCompare(b.title);
      case "updated_desc":
      default:
        return (b.updated_at || "").localeCompare(a.updated_at || "");
    }
  });

  const countLabel = document.getElementById("recipe-count-label");
  if (countLabel) {
    countLabel.textContent = `${filteredRecipes.length} de ${allRecipes.length} recetas`;
  }

  renderRecipeList();
}

function resetAllFilters() {
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-cookable-today").checked = false;
  document.getElementById("filter-ing-include").value = "";
  document.getElementById("filter-ing-exclude").value = "";
  document.getElementById("filter-category").value = "";
  document.getElementById("filter-subrecipe").value = "all";
  document.getElementById("filter-utensil").value = "";
  document.getElementById("filter-technique").value = "";
  document.getElementById("sort-by").value = "updated_desc";
  applyFilters();
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function renderRecipeList() {
  const container = document.getElementById("recipe-list-container");
  if (!container) return;

  if (filteredRecipes.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-stone-500 space-y-2">
        <div class="text-2xl">🍳</div>
        <p class="text-sm font-medium text-stone-700">No hay recetas que coincidan con los filtros</p>
        <button onclick="resetAllFilters()" class="text-xs text-amber-700 underline hover:text-amber-900">
          Restablecer filtros
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredRecipes
    .map((r) => {
      const isSelected = r.id === activeRecipeId;
      const eq = checkRecipeEquipmentStatus(r);
      const activeTime = (r.timings?.prep_minutes || 0) + (r.timings?.cook_minutes || 0);
      const totalTime = activeTime + (r.timings?.rest_minutes || 0);

      return `
        <div onclick="selectRecipe('${escapeHtml(r.id)}')"
          class="p-4 cursor-pointer transition hover:bg-amber-50/40 ${
            isSelected ? "bg-amber-50/90 border-l-4 border-l-amber-700" : "bg-white"
          }">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-0.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                ${
                  r.is_subrecipe
                    ? `<span class="text-[10px] font-mono-tech uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-amber-300 font-semibold">SUB-RECETA / BASE</span>`
                    : `<span class="text-[10px] font-mono-tech uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-700 font-medium">${escapeHtml(r.category)}</span>`
                }
                ${
                  r.scaling_mode === "bakers_pct"
                    ? `<span class="text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">% Panadero</span>`
                    : ""
                }
              </div>
              <h3 class="font-serif-title font-bold text-stone-900 text-base leading-snug pt-0.5">
                ${escapeHtml(r.title)}
              </h3>
            </div>
            <div class="text-right shrink-0">
              <span class="inline-flex items-center gap-0.5 text-xs font-mono-tech font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                ★ ${(r.rating || 0).toFixed(1)}
              </span>
            </div>
          </div>

          ${
            r.subtitle
              ? `<p class="text-xs text-stone-500 line-clamp-1 mt-1">${escapeHtml(r.subtitle)}</p>`
              : ""
          }

          <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-stone-500 font-mono-tech">
            <div class="flex items-center gap-2">
              <span title="Complejidad técnica">Dif: ${"●".repeat(r.difficulty || 1)}${"○".repeat(5 - (r.difficulty || 1))}</span>
              <span>·</span>
              <span title="Tiempo activo (Prep + Cocción)">⏱ ${formatDuration(activeTime)}</span>
              ${
                r.timings?.rest_minutes
                  ? `<span class="text-stone-400" title="Tiempo total incl. reposo/fermentación">(Tot: ${formatDuration(totalTime)})</span>`
                  : ""
              }
            </div>

            <div class="flex items-center gap-1">
              ${
                !eq.canCookMandatory
                  ? `<span class="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-sans font-semibold text-[10px]" title="Falta algún utensilio obligatorio en tu cocina">⚠ Falta obligatorio</span>`
                  : `<span class="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-sans text-[10px]" title="${eq.mandatoryCount} obligatorios, ${eq.optionalCount} opcionales">🔪 ${eq.mandatoryCount} obl · ${eq.optionalCount} opc</span>`
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function selectRecipe(recipeId) {
  const recipe = allRecipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  activeRecipeId = recipeId;
  currentScaleFactor = 1.0;
  currentViewScalingMode = recipe.scaling_mode || "servings";
  checkedIngredients.clear();
  checkedSteps.clear();

  renderRecipeList();
  renderRecipeDetail(recipe);
}

// Calcula el peso base total (100% de referencia para porcentaje de panadero)
function getBaseWeightTotal(recipe) {
  const baseItems = (recipe.ingredients || []).filter((i) => i.is_base_weight && i.amount);
  if (baseItems.length > 0) {
    return baseItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }
  // Si no hay ninguno marcado como base, usar el primer ingrediente con cantidad como referencia
  const firstWithAmount = (recipe.ingredients || []).find((i) => i.amount && i.amount > 0);
  return firstWithAmount ? Number(firstWithAmount.amount) : 1000;
}

function renderRecipeDetail(recipe) {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;

  const uMap = getUtensilMap();
  const eqStatus = checkRecipeEquipmentStatus(recipe);
  const mandatoryUtensils = (recipe.utensils || []).filter((u) => u.mandatory);
  const optionalUtensils = (recipe.utensils || []).filter((u) => !u.mandatory);

  const baseWeight100 = getBaseWeightTotal(recipe);
  const scaledBaseWeight = Math.round(baseWeight100 * currentScaleFactor * 10) / 10;
  const scaledServings = Math.round(recipe.servings * currentScaleFactor * 100) / 100;

  // Buscar si esta receta es usada como sub-receta en otros platos
  const usedInRecipes = allRecipes.filter((other) =>
    (other.subrecipes || []).some((sr) => sr.recipe_id === recipe.id)
  );

  // Agrupar ingredientes por su grupo de Mise en Place
  const ingredientGroups = {};
  for (let idx = 0; idx < (recipe.ingredients || []).length; idx++) {
    const ing = recipe.ingredients[idx];
    const gName = ing.group || "Principal";
    if (!ingredientGroups[gName]) ingredientGroups[gName] = [];
    ingredientGroups[gName].push({ ...ing, _idx: idx });
  }

  const activeMin = (recipe.timings?.prep_minutes || 0) + (recipe.timings?.cook_minutes || 0);
  const totalMin = activeMin + (recipe.timings?.rest_minutes || 0);

  container.innerHTML = `
    <div class="p-6 sm:p-8 space-y-8">

      <!-- Cabecera de la Ficha Técnica -->
      <div class="border-b border-stone-200 pb-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-1 rounded-md text-xs font-mono-tech uppercase tracking-wider font-semibold ${
              recipe.is_subrecipe
                ? "bg-stone-900 text-amber-300"
                : "bg-amber-100/90 text-amber-950"
            }">
              ${recipe.is_subrecipe ? "🧪 Elaboración Base / Sub-receta" : escapeHtml(recipe.category)}
            </span>

            <span class="px-2.5 py-1 rounded-md text-xs font-mono-tech bg-stone-100 text-stone-700 border border-stone-200">
              Complejidad: ${"★".repeat(recipe.difficulty)}${"☆".repeat(5 - recipe.difficulty)} (${recipe.difficulty}/5)
            </span>

            <span class="px-2.5 py-1 rounded-md text-xs font-mono-tech bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
              Valoración: ★ ${(recipe.rating || 0).toFixed(1)} / 5.0
            </span>
          </div>

          <!-- Botonera de Acciones -->
          <div class="no-print flex items-center gap-2 flex-wrap">
            <button onclick="openMarkdownModal('${escapeHtml(recipe.id)}')"
              class="px-3 py-1.5 text-xs font-mono-tech font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg border border-stone-300 transition"
              title="Ver o editar directamente el archivo Markdown (.md) con su cabecera YAML">
              📄 .MD / YAML
            </button>
            <button onclick="window.print()"
              class="px-3 py-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg border border-stone-300 transition">
              🖨 Imprimir Ficha
            </button>
            <button onclick="duplicateRecipe('${escapeHtml(recipe.id)}')"
              class="px-3 py-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg border border-stone-300 transition">
              ⧉ Duplicar
            </button>
            <button onclick="openRecipeEditor('${escapeHtml(recipe.id)}')"
              class="px-3.5 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-700 text-white rounded-lg transition">
              ✎ Editar Receta
            </button>
            <button onclick="confirmDeleteRecipe('${escapeHtml(recipe.id)}')"
              class="px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition"
              title="Eliminar receta">
              🗑
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 ${recipe.cover_photo ? "md:grid-cols-12 gap-6 items-center" : ""}">
          <div class="${recipe.cover_photo ? "md:col-span-8" : ""} space-y-2">
            <h1 class="font-serif-title text-2xl sm:text-4xl font-bold text-stone-900 leading-tight">
              ${escapeHtml(recipe.title)}
            </h1>
            ${
              recipe.subtitle
                ? `<p class="text-base sm:text-lg text-stone-600 font-serif-title italic">${escapeHtml(recipe.subtitle)}</p>`
                : ""
            }

            <!-- Técnicas y Etiquetas -->
            <div class="pt-2 flex flex-wrap items-center gap-1.5">
              ${(recipe.techniques || [])
                .map(
                  (t) =>
                    `<span class="text-xs px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-100 font-medium">🔥 ${escapeHtml(t)}</span>`
                )
                .join("")}
              ${(recipe.tags || [])
                .map(
                  (tag) =>
                    `<span class="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 font-mono-tech">#${escapeHtml(tag)}</span>`
                )
                .join("")}
            </div>
          </div>

          ${
            recipe.cover_photo
              ? `
            <div class="md:col-span-4">
              <img src="${escapeHtml(recipe.cover_photo)}" alt="${escapeHtml(recipe.title)}"
                class="w-full h-48 object-cover rounded-xl border border-stone-200 shadow-sm" />
            </div>
          `
              : ""
          }
        </div>

        <!-- Banda de Tiempos Desglosados -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div class="bg-stone-50 border border-stone-200/90 rounded-xl p-3">
            <div class="text-[11px] font-mono-tech uppercase text-stone-500">Mise en place (Prep)</div>
            <div class="text-lg font-bold font-mono-tech text-stone-900">${formatDuration(recipe.timings?.prep_minutes || 0)}</div>
          </div>
          <div class="bg-stone-50 border border-stone-200/90 rounded-xl p-3">
            <div class="text-[11px] font-mono-tech uppercase text-stone-500">Cocción Activa</div>
            <div class="text-lg font-bold font-mono-tech text-stone-900">${formatDuration(recipe.timings?.cook_minutes || 0)}</div>
          </div>
          <div class="bg-stone-50 border border-stone-200/90 rounded-xl p-3">
            <div class="text-[11px] font-mono-tech uppercase text-stone-500">Reposo / Fermentación</div>
            <div class="text-lg font-bold font-mono-tech text-amber-800">${formatDuration(recipe.timings?.rest_minutes || 0)}</div>
            ${
              recipe.timings?.rest_notes
                ? `<div class="text-[11px] text-stone-500 leading-tight mt-0.5">${escapeHtml(recipe.timings.rest_notes)}</div>`
                : ""
            }
          </div>
          <div class="bg-stone-900 text-stone-100 rounded-xl p-3">
            <div class="text-[11px] font-mono-tech uppercase text-stone-400">Tiempo Total</div>
            <div class="text-lg font-bold font-mono-tech text-amber-400">${formatDuration(totalMin)}</div>
            <div class="text-[11px] text-stone-400">Activo: ${formatDuration(activeMin)}</div>
          </div>
        </div>
      </div>

      <!-- SECCIÓN DE UTENSILIOS OBLIGATORIOS Y OPCIONALES -->
      <section class="bg-stone-50/90 border border-stone-200 rounded-2xl p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="font-serif-title text-lg font-bold text-stone-900">
              🔪 Equipamiento y Utensilios de la Receta
            </h2>
            ${
              eqStatus.canCookMandatory
                ? `<span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-medium border border-emerald-300">✓ Tienes todo el equipo obligatorio</span>`
                : `<span class="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 font-semibold border border-red-300">⚠ Te falta ${eqStatus.missingMandatory.length} utensilio obligatorio en inventario</span>`
            }
          </div>
          <button onclick="openUtensilsModal()" class="no-print text-xs font-medium text-amber-800 hover:underline">
            Gestionar inventario de mi cocina →
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Columna Obligatorios -->
          <div class="space-y-2.5">
            <div class="flex items-center gap-2 text-xs font-mono-tech uppercase tracking-wider font-bold text-amber-900">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-700 inline-block"></span>
              <span>Utensilios Obligatorios (${mandatoryUtensils.length})</span>
            </div>
            ${
              mandatoryUtensils.length === 0
                ? `<p class="text-xs text-stone-400 italic">Ningún utensilio especial obligatorio.</p>`
                : mandatoryUtensils
                    .map((u) => {
                      const catItem = uMap[u.utensil_id];
                      const isOwned = catItem ? catItem.owned : true;
                      return `
                        <div class="badge-mandatory rounded-xl p-3 flex items-start justify-between gap-3 shadow-2xs">
                          <div class="space-y-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-[10px] font-mono-tech uppercase px-1.5 py-0.5 rounded bg-amber-800 text-white font-bold">
                                OBLIGATORIO
                              </span>
                              <span class="font-semibold text-sm text-stone-900">${escapeHtml(u.name)}</span>
                            </div>
                            ${
                              u.notes
                                ? `<p class="text-xs text-stone-700 leading-relaxed">${escapeHtml(u.notes)}</p>`
                                : ""
                            }
                          </div>
                          <button onclick="quickToggleUtensilOwned('${escapeHtml(u.utensil_id)}')"
                            title="Haz clic para cambiar disponibilidad en tu cocina"
                            class="no-print shrink-0 text-[11px] font-mono-tech px-2 py-1 rounded border transition ${
                              isOwned
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                : "bg-red-100 border-red-300 text-red-900 font-bold hover:bg-red-200"
                            }">
                            ${isOwned ? "✓ En cocina" : "✗ No disp."}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>

          <!-- Columna Opcionales / Sustituibles -->
          <div class="space-y-2.5">
            <div class="flex items-center gap-2 text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-600">
              <span class="w-2.5 h-2.5 rounded-full border-2 border-stone-500 inline-block"></span>
              <span>Utensilios Opcionales / Sustituibles (${optionalUtensils.length})</span>
            </div>
            ${
              optionalUtensils.length === 0
                ? `<p class="text-xs text-stone-400 italic">Sin utensilios opcionales registrados.</p>`
                : optionalUtensils
                    .map((u) => {
                      const catItem = uMap[u.utensil_id];
                      const isOwned = catItem ? catItem.owned : true;
                      return `
                        <div class="badge-optional rounded-xl p-3 flex items-start justify-between gap-3">
                          <div class="space-y-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-[10px] font-mono-tech uppercase px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 font-semibold">
                                OPCIONAL
                              </span>
                              <span class="font-semibold text-sm text-stone-800">${escapeHtml(u.name)}</span>
                            </div>
                            ${
                              u.notes
                                ? `<p class="text-xs text-stone-600 leading-relaxed">💡 <strong>Alternativa / Uso:</strong> ${escapeHtml(u.notes)}</p>`
                                : ""
                            }
                          </div>
                          <button onclick="quickToggleUtensilOwned('${escapeHtml(u.utensil_id)}')"
                            title="Haz clic para cambiar disponibilidad en tu cocina"
                            class="no-print shrink-0 text-[11px] font-mono-tech px-2 py-1 rounded border transition ${
                              isOwned
                                ? "bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200"
                                : "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                            }">
                            ${isOwned ? "✓ En cocina" : "Usar alt."}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>
        </div>
      </section>

      <!-- SUB-RECETAS VINCULADAS Y DEPENDENCIAS -->
      ${
        (recipe.subrecipes && recipe.subrecipes.length > 0) || usedInRecipes.length > 0
          ? `
        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${
            recipe.subrecipes && recipe.subrecipes.length > 0
              ? `
            <div class="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-2.5">
              <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-amber-950 flex items-center gap-1.5">
                <span>🔗 Elaboraciones Previas Requeridas (Sub-recetas)</span>
              </h3>
              <div class="space-y-2">
                ${recipe.subrecipes
                  .map((sr) => {
                    const scaledAmt =
                      sr.amount !== null && sr.amount !== undefined
                        ? formatNumber(sr.amount * currentScaleFactor)
                        : "";
                    const targetExists = allRecipes.some((r) => r.id === sr.recipe_id);
                    return `
                      <div class="bg-white border border-amber-200/90 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
                        <div>
                          <div class="font-semibold text-sm text-stone-900">
                            ${escapeHtml(sr.name)}
                          </div>
                          <div class="text-xs text-stone-600 font-mono-tech">
                            Cantidad escalada: <strong>${scaledAmt} ${escapeHtml(sr.unit || "")}</strong>
                            ${sr.notes ? ` · <span class="font-sans text-stone-500">${escapeHtml(sr.notes)}</span>` : ""}
                          </div>
                        </div>
                        ${
                          targetExists
                            ? `<button onclick="selectRecipe('${escapeHtml(sr.recipe_id)}')"
                                class="px-2.5 py-1 text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded-lg shrink-0 transition">
                                Abrir sub-receta →
                              </button>`
                            : `<span class="text-xs text-stone-400 italic">ID: ${escapeHtml(sr.recipe_id)}</span>`
                        }
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `
              : ""
          }

          ${
            usedInRecipes.length > 0
              ? `
            <div class="bg-stone-100/80 border border-stone-200 rounded-2xl p-4 space-y-2.5">
              <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">
                📌 Esta elaboración base se utiliza en:
              </h3>
              <div class="flex flex-wrap gap-2">
                ${usedInRecipes
                  .map(
                    (parent) => `
                  <button onclick="selectRecipe('${escapeHtml(parent.id)}')"
                    class="px-3 py-1.5 bg-white hover:bg-amber-50 border border-stone-300 rounded-xl text-xs font-semibold text-stone-800 transition flex items-center gap-1.5">
                    <span>🍲 ${escapeHtml(parent.title)}</span>
                    <span class="text-amber-700">→</span>
                  </button>
                `
                  )
                  .join("")}
              </div>
            </div>
          `
              : ""
          }
        </section>
      `
          : ""
      }

      <!-- GRID PRINCIPAL: ESCANDALLO DE INGREDIENTES (IZQ) + TEMPERATURAS Y PASOS (DER) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

        <!-- Columna Izquierda (5 cols): Escalado Dinámico + Ingredientes -->
        <div class="lg:col-span-5 space-y-5">

          <!-- Panel de Escalado Dinámico -->
          <div class="bg-stone-900 text-stone-100 rounded-2xl p-4 space-y-3 shadow-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-mono-tech uppercase tracking-wider text-amber-400 font-semibold">
                ⚖️ Escandallo y Escalado Dinámico
              </span>
              <div class="no-print flex rounded-lg bg-stone-800 p-0.5 text-[11px] font-mono-tech">
                <button onclick="switchViewScalingMode('servings')"
                  class="px-2 py-0.5 rounded-md transition ${
                    currentViewScalingMode === "servings"
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-stone-400 hover:text-white"
                  }">
                  Raciones
                </button>
                <button onclick="switchViewScalingMode('bakers_pct')"
                  class="px-2 py-0.5 rounded-md transition ${
                    currentViewScalingMode === "bakers_pct"
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-stone-400 hover:text-white"
                  }">
                  % Panadero
                </button>
              </div>
            </div>

            ${
              currentViewScalingMode === "servings"
                ? `
              <div class="flex items-center justify-between gap-3 pt-1">
                <div>
                  <label class="block text-[11px] text-stone-400">Rendimiento deseado (${escapeHtml(recipe.yield_unit)})</label>
                  <div class="flex items-center gap-2 mt-1">
                    <input type="number" step="any" min="0.1" value="${scaledServings}"
                      onchange="scaleByServingsInput(this.value, ${recipe.servings})"
                      class="w-24 px-2.5 py-1 bg-stone-800 border border-stone-700 rounded-lg text-amber-300 font-mono-tech font-bold text-sm focus:outline-none focus:border-amber-500" />
                    <span class="text-xs text-stone-300">${escapeHtml(recipe.yield_unit)}</span>
                  </div>
                </div>
                <div class="no-print flex flex-wrap gap-1 justify-end">
                  ${[0.5, 1, 1.5, 2, 3]
                    .map(
                      (factor) => `
                    <button onclick="setScaleFactor(${factor})"
                      class="px-2 py-1 rounded text-xs font-mono-tech border transition ${
                        Math.abs(currentScaleFactor - factor) < 0.01
                          ? "bg-amber-600 border-amber-500 text-white font-bold"
                          : "bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700"
                      }">
                      ${factor}x
                    </button>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : `
              <div class="space-y-2 pt-1">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <label class="block text-[11px] text-stone-400">Peso Base Total (100% Referencia)</label>
                    <div class="flex items-center gap-1.5 mt-1">
                      <input type="number" step="10" min="10" value="${scaledBaseWeight}"
                        onchange="scaleByBaseWeightInput(this.value, ${baseWeight100})"
                        class="w-28 px-2.5 py-1 bg-stone-800 border border-stone-700 rounded-lg text-amber-300 font-mono-tech font-bold text-sm focus:outline-none focus:border-amber-500" />
                      <span class="text-xs font-mono-tech text-stone-300">g (100%)</span>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="block text-[11px] text-stone-400">Factor actual</span>
                    <span class="font-mono-tech text-sm font-bold text-amber-400">${(currentScaleFactor * 100).toFixed(0)}% (${currentScaleFactor.toFixed(2)}x)</span>
                  </div>
                </div>
                <p class="text-[11px] text-stone-400 leading-tight">
                  Los ingredientes marcados como <strong>Base 100%</strong> suman la referencia sobre la que se calculan todos los demás porcentajes.
                </p>
              </div>
            `
            }
          </div>

          <!-- Lista de Ingredientes Agrupados -->
          <div class="bg-stone-50/70 border border-stone-200 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-serif-title text-lg font-bold text-stone-900">Mise en Place / Ingredientes</h3>
              <span class="text-[11px] text-stone-500">Haz clic para tachar</span>
            </div>

            <div class="space-y-4">
              ${Object.entries(ingredientGroups)
                .map(
                  ([groupName, items]) => `
                <div class="space-y-1.5">
                  ${
                    Object.keys(ingredientGroups).length > 1 || groupName !== "Principal"
                      ? `<h4 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-amber-900 border-b border-stone-200 pb-1">${escapeHtml(groupName)}</h4>`
                      : ""
                  }
                  <ul class="divide-y divide-stone-200/60">
                    ${items
                      .map((ing) => {
                        const isChecked = checkedIngredients.has(ing._idx);
                        const scaledAmt =
                          ing.amount !== null && ing.amount !== undefined
                            ? formatNumber(ing.amount * currentScaleFactor)
                            : "";
                        const pct =
                          baseWeight100 > 0 && ing.amount
                            ? ((ing.amount / baseWeight100) * 100).toFixed(1)
                            : null;

                        return `
                          <li onclick="toggleIngredientCheck(${ing._idx})"
                            class="ingredient-row-text py-2 flex items-start justify-between gap-2 cursor-pointer select-none hover:bg-amber-50/50 rounded px-1.5 transition ${
                              isChecked ? "line-through opacity-45" : ""
                            }">
                            <div class="flex items-start gap-2">
                              <input type="checkbox" ${isChecked ? "checked" : ""}
                                class="mt-1 accent-amber-700 rounded pointer-events-none" />
                              <div>
                                <span class="font-medium text-stone-900">${escapeHtml(ing.name)}</span>
                                ${
                                  ing.is_base_weight
                                    ? `<span class="ml-1 text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 font-semibold">Base 100%</span>`
                                    : ""
                                }
                                ${
                                  ing.notes
                                    ? `<div class="text-xs text-stone-500">${escapeHtml(ing.notes)}</div>`
                                    : ""
                                }
                              </div>
                            </div>
                            <div class="text-right shrink-0 font-mono-tech">
                              <div class="font-bold text-stone-900 text-sm">
                                ${scaledAmt} ${escapeHtml(ing.unit || "")}
                              </div>
                              ${
                                currentViewScalingMode === "bakers_pct" && pct !== null
                                  ? `<div class="text-[11px] text-amber-800 font-semibold">${pct}%</div>`
                                  : ""
                              }
                            </div>
                          </li>
                        `;
                      })
                      .join("")}
                  </ul>
                </div>
              `
                )
                .join("")}
            </div>
          </div>

          <!-- Tabla de Temperaturas Críticas -->
          ${
            recipe.temperatures && recipe.temperatures.length > 0
              ? `
            <div class="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
              <h3 class="font-serif-title text-base font-bold text-stone-900 flex items-center gap-2">
                <span>🌡️ Control de Temperaturas Críticas</span>
              </h3>
              <div class="divide-y divide-stone-200/80">
                ${recipe.temperatures
                  .map(
                    (tp) => `
                  <div class="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div class="text-xs font-semibold text-stone-800">${escapeHtml(tp.stage)}</div>
                      ${
                        tp.notes
                          ? `<div class="text-[11px] text-stone-500">${escapeHtml(tp.notes)}</div>`
                          : ""
                      }
                    </div>
                    <span class="font-mono-tech font-bold text-sm px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 shrink-0">
                      ${tp.temp_c} °C
                    </span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>
          `
              : ""
          }
        </div>

        <!-- Columna Derecha (7 cols): Procedimiento Paso a Paso, Emplatado e Historial I+D -->
        <div class="lg:col-span-7 space-y-6">

          <!-- Paso a Paso -->
          <div class="space-y-4">
            <h3 class="font-serif-title text-xl font-bold text-stone-900 border-b border-stone-200 pb-2">
              Procedimiento Técnico Paso a Paso
            </h3>

            <div class="space-y-4">
              ${(recipe.steps || [])
                .map((step, idx) => {
                  const isDone = checkedSteps.has(idx);
                  return `
                    <div class="p-4 rounded-2xl border transition ${
                      isDone
                        ? "bg-stone-50 border-stone-200 opacity-60"
                        : "bg-white border-stone-200/90 shadow-2xs hover:border-amber-300"
                    }">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex items-center gap-2.5 cursor-pointer" onclick="toggleStepCheck(${idx})">
                          <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono-tech text-xs font-bold ${
                            isDone
                              ? "bg-emerald-700 text-white"
                              : "bg-stone-900 text-amber-300"
                          }">
                            ${isDone ? "✓" : step.order || idx + 1}
                          </span>
                          <h4 class="font-bold text-stone-900 text-base">
                            ${escapeHtml(step.title || `Paso ${idx + 1}`)}
                          </h4>
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0">
                          ${
                            step.temp_c !== null && step.temp_c !== undefined && step.temp_c !== ""
                              ? `<span class="font-mono-tech text-xs px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 font-semibold">
                                  🌡 ${step.temp_c}°C
                                </span>`
                              : ""
                          }
                          ${
                            step.duration_minutes
                              ? `<button onclick="startKitchenTimer('${escapeHtml(step.title || `Paso ${idx + 1}`)}', ${step.duration_minutes})"
                                  class="no-print font-mono-tech text-xs px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-600 hover:text-white text-amber-950 font-semibold border border-amber-300 transition flex items-center gap-1"
                                  title="Iniciar temporizador de cocina para este paso">
                                  <span>⏱</span>
                                  <span>${step.duration_minutes} min</span>
                                </button>`
                              : ""
                          }
                        </div>
                      </div>

                      <p class="recipe-step-text text-stone-700 text-sm leading-relaxed mt-2.5 pl-9">
                        ${escapeHtml(step.instruction)}
                      </p>

                      ${
                        step.critical_point
                          ? `
                        <div class="mt-3 ml-9 p-2.5 rounded-xl bg-amber-50/90 border-l-4 border-l-amber-600 text-xs text-amber-950">
                          <strong>⚡ Punto Crítico (PCC) / Tip:</strong> ${escapeHtml(step.critical_point)}
                        </div>
                      `
                          : ""
                      }

                      ${
                        step.photo
                          ? `
                        <div class="mt-3 ml-9">
                          <img src="${escapeHtml(step.photo)}" alt="Foto paso ${idx + 1}"
                            class="max-h-52 rounded-xl border border-stone-200 object-cover" />
                        </div>
                      `
                          : ""
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>

          <!-- Emplatado y Notas del Chef -->
          ${
            recipe.plating_notes || recipe.chef_notes
              ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              ${
                recipe.plating_notes
                  ? `
                <div class="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-1.5">
                  <h4 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">
                    🍽️ Emplatado, Acabado y Pase
                  </h4>
                  <p class="text-sm text-stone-700 leading-relaxed whitespace-pre-line">${escapeHtml(recipe.plating_notes)}</p>
                </div>
              `
                  : ""
              }
              ${
                recipe.chef_notes
                  ? `
                <div class="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-1.5">
                  <h4 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">
                    📋 Notas Técnicas / Conservación
                  </h4>
                  <p class="text-sm text-stone-700 leading-relaxed whitespace-pre-line">${escapeHtml(recipe.chef_notes)}</p>
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }

          <!-- Historial de Iteraciones y Pruebas (I+D) -->
          <div class="bg-stone-100/70 border border-stone-200 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3 class="font-serif-title text-lg font-bold text-stone-900">
                  🔬 Cuaderno de Iteraciones y Pruebas (I+D)
                </h3>
                <p class="text-xs text-stone-500">Registra ajustes de hidratación, tiempos, sazonado o texturas entre pruebas</p>
              </div>
              <button onclick="toggleQuickIterationForm()"
                class="no-print px-3 py-1.5 text-xs font-semibold bg-white border border-stone-300 hover:bg-stone-50 rounded-lg text-stone-800 transition">
                ＋ Anotar Prueba
              </button>
            </div>

            <!-- Formulario rápido para añadir una iteración sin entrar al editor completo -->
            <div id="quick-iteration-form" class="hidden bg-white border border-amber-300 rounded-xl p-4 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] font-semibold text-stone-600 mb-1">Versión</label>
                  <input id="quick-it-version" type="text" value="v1.${(recipe.iterations || []).length + 1}"
                    class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg font-mono-tech" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-stone-600 mb-1">Fecha</label>
                  <input id="quick-it-date" type="date" value="${new Date().toISOString().slice(0, 10)}"
                    class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg font-mono-tech" />
                </div>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-stone-600 mb-1">Cambios probados y resultado sensorial</label>
                <textarea id="quick-it-changes" rows="2" placeholder="Ej. Subida temperatura de horno a 255°C; mejor greñado..."
                  class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg"></textarea>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-stone-600 mb-1">Siguiente ajuste a probar</label>
                <input id="quick-it-next" type="text" placeholder="Ej. Reducir sal un 0.2%..."
                  class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg" />
              </div>
              <div class="flex justify-end gap-2">
                <button onclick="toggleQuickIterationForm()" class="px-3 py-1 text-xs text-stone-600">Cancelar</button>
                <button onclick="saveQuickIteration('${escapeHtml(recipe.id)}')"
                  class="px-3.5 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-600">
                  Guardar Iteración
                </button>
              </div>
            </div>

            ${
              !recipe.iterations || recipe.iterations.length === 0
                ? `<p class="text-xs text-stone-500 italic">Aún no hay notas de iteración registradas para esta receta.</p>`
                : `
              <div class="space-y-3 border-l-2 border-amber-700/40 pl-4 ml-1">
                ${recipe.iterations
                  .map(
                    (it) => `
                  <div class="bg-white border border-stone-200/90 rounded-xl p-3 space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-mono-tech text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-950">
                        ${escapeHtml(it.version)}
                      </span>
                      <span class="font-mono-tech text-[11px] text-stone-400">${escapeHtml(it.date)}</span>
                    </div>
                    <p class="text-xs text-stone-800 leading-relaxed">${escapeHtml(it.changes)}</p>
                    ${
                      it.next_steps
                        ? `<p class="text-[11px] text-amber-900 bg-amber-50/70 px-2 py-1 rounded">🎯 <strong>Próximo paso:</strong> ${escapeHtml(it.next_steps)}</p>`
                        : ""
                    }
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
            }
          </div>

        </div>
      </div>
    </div>
  `;
}

// Funciones de Escalado e Interacción en Vista Detalle
function setScaleFactor(factor) {
  currentScaleFactor = Number(factor) || 1.0;
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function scaleByServingsInput(newServings, baseServings) {
  const val = parseFloat(newServings);
  if (!val || val <= 0 || !baseServings) return;
  currentScaleFactor = val / baseServings;
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function scaleByBaseWeightInput(newBaseWeight, originalBaseWeight) {
  const val = parseFloat(newBaseWeight);
  if (!val || val <= 0 || !originalBaseWeight) return;
  currentScaleFactor = val / originalBaseWeight;
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function switchViewScalingMode(mode) {
  currentViewScalingMode = mode;
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function toggleIngredientCheck(idx) {
  if (checkedIngredients.has(idx)) checkedIngredients.delete(idx);
  else checkedIngredients.add(idx);
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function toggleStepCheck(idx) {
  if (checkedSteps.has(idx)) checkedSteps.delete(idx);
  else checkedSteps.add(idx);
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

function toggleQuickIterationForm() {
  const el = document.getElementById("quick-iteration-form");
  if (el) el.classList.toggle("hidden");
}

async function saveQuickIteration(recipeId) {
  const recipe = allRecipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  const version = document.getElementById("quick-it-version").value.trim() || "v1.1";
  const date = document.getElementById("quick-it-date").value || new Date().toISOString().slice(0, 10);
  const changes = document.getElementById("quick-it-changes").value.trim();
  const next_steps = document.getElementById("quick-it-next").value.trim();

  if (!changes) {
    alert("Escribe los cambios o resultados de la prueba.");
    return;
  }

  const updated = structuredClone(recipe);
  updated.iterations = updated.iterations || [];
  updated.iterations.push({ version, date, changes, next_steps });

  const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (res.ok) {
    await loadInitialData(recipeId);
  }
}

// Cambiar en 1 clic si tienes o no un utensilio en tu cocina
async function quickToggleUtensilOwned(utensilId) {
  const item = utensilsCatalog.find((u) => u.id === utensilId);
  if (!item) return;
  item.owned = !item.owned;
  await fetch("/api/utensils", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(utensilsCatalog),
  });
  updateUtensilHeaderCounter();
  populateFilterDropdowns();
  applyFilters();
  const recipe = allRecipes.find((r) => r.id === activeRecipeId);
  if (recipe) renderRecipeDetail(recipe);
}

// Temporizadores de Cocina Multicanal
function startKitchenTimer(label, minutes) {
  const totalSeconds = Math.round((Number(minutes) || 1) * 60);
  const timerObj = {
    id: "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    label,
    remainingSeconds: totalSeconds,
    totalSeconds,
    paused: false,
  };
  activeTimers.push(timerObj);
  ensureTimerInterval();
  renderTimersDock();
}

function ensureTimerInterval() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    let anyActive = false;
    for (const t of activeTimers) {
      if (!t.paused && t.remainingSeconds > 0) {
        t.remainingSeconds -= 1;
        anyActive = true;
        if (t.remainingSeconds === 0) {
          playTimerBeep();
        }
      }
    }
    renderTimersDock();
    if (activeTimers.length === 0) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }, 1000);
}

function togglePauseTimer(timerId) {
  const t = activeTimers.find((x) => x.id === timerId);
  if (t) t.paused = !t.paused;
  renderTimersDock();
}

function removeTimer(timerId) {
  activeTimers = activeTimers.filter((x) => x.id !== timerId);
  renderTimersDock();
}

function playTimerBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch (e) {}
}

function renderTimersDock() {
  const dock = document.getElementById("timers-dock");
  if (!dock) return;

  dock.innerHTML = activeTimers
    .map((t) => {
      const m = Math.floor(t.remainingSeconds / 60);
      const s = t.remainingSeconds % 60;
      const timeStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      const isFinished = t.remainingSeconds === 0;
      return `
        <div class="pointer-events-auto rounded-xl p-3 shadow-xl border flex items-center justify-between gap-3 ${
          isFinished
            ? "bg-red-700 text-white border-red-500 animate-pulse"
            : "bg-stone-900 text-stone-100 border-stone-700"
        }">
          <div>
            <div class="text-[11px] text-amber-300 font-semibold">${escapeHtml(t.label)}</div>
            <div class="font-mono-tech text-xl font-bold">${timeStr} ${isFinished ? "¡LISTO!" : ""}</div>
          </div>
          <div class="flex items-center gap-1.5">
            ${
              !isFinished
                ? `<button onclick="togglePauseTimer('${t.id}')" class="px-2.5 py-1 text-xs rounded bg-stone-800 hover:bg-stone-700">
                    ${t.paused ? "▶" : "⏸"}
                  </button>`
                : ""
            }
            <button onclick="removeTimer('${t.id}')" class="px-2 py-1 text-xs rounded bg-stone-800 hover:bg-red-800">
              ✕
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// Modo Cocina (Tipografía grande + Screen Wake Lock)
async function toggleKitchenMode() {
  document.body.classList.toggle("kitchen-mode");
  const isActive = document.body.classList.contains("kitchen-mode");
  const btn = document.getElementById("btn-kitchen-mode");
  if (btn) {
    if (isActive) {
      btn.classList.add("bg-amber-600", "text-white", "border-amber-500");
    } else {
      btn.classList.remove("bg-amber-600", "text-white", "border-amber-500");
    }
  }
  try {
    if (isActive && "wakeLock" in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
    } else if (!isActive && wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (e) {}
}

// ============================================================================
// EDITOR COMPLETO DE RECETAS (CREAR / MODIFICAR)
// ============================================================================
let editingDraft = null;
let editingOriginalId = null;

function openRecipeEditor(recipeId = null) {
  editingOriginalId = recipeId;
  if (recipeId) {
    const existing = allRecipes.find((r) => r.id === recipeId);
    editingDraft = structuredClone(existing);
  } else {
    editingDraft = {
      id: "",
      title: "",
      subtitle: "",
      category: "Principal",
      is_subrecipe: false,
      difficulty: 3,
      rating: 4.5,
      servings: 4,
      yield_unit: "raciones",
      scaling_mode: "servings",
      techniques: [],
      tags: [],
      timings: { prep_minutes: 20, cook_minutes: 30, rest_minutes: 0, rest_notes: "" },
      temperatures: [{ stage: "Cocción principal", temp_c: 180, notes: "" }],
      utensils: [],
      subrecipes: [],
      ingredients: [
        { name: "", amount: 100, unit: "g", group: "Principal", is_base_weight: true, notes: "" },
      ],
      steps: [
        { order: 1, title: "", instruction: "", duration_minutes: null, temp_c: null, critical_point: "", photo: "" },
      ],
      plating_notes: "",
      chef_notes: "",
      iterations: [],
      cover_photo: "",
      gallery: [],
    };
  }
  renderRecipeEditor();
}

function syncDraftScalarsFromDOM() {
  if (!editingDraft) return;
  const val = (id) => document.getElementById(id)?.value ?? "";
  editingDraft.title = val("ed-title");
  editingDraft.subtitle = val("ed-subtitle");
  editingDraft.category = val("ed-category") || "Principal";
  editingDraft.is_subrecipe = document.getElementById("ed-is-subrecipe")?.checked || false;
  editingDraft.difficulty = parseInt(val("ed-difficulty") || "3", 10);
  editingDraft.rating = parseFloat(val("ed-rating") || "0");
  editingDraft.servings = parseFloat(val("ed-servings") || "4") || 1;
  editingDraft.yield_unit = val("ed-yield-unit") || "raciones";
  editingDraft.scaling_mode = val("ed-scaling-mode") || "servings";
  editingDraft.cover_photo = val("ed-cover-photo");

  editingDraft.techniques = val("ed-techniques")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  editingDraft.tags = val("ed-tags")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  editingDraft.timings = {
    prep_minutes: parseInt(val("ed-prep-min") || "0", 10) || 0,
    cook_minutes: parseInt(val("ed-cook-min") || "0", 10) || 0,
    rest_minutes: parseInt(val("ed-rest-min") || "0", 10) || 0,
    rest_notes: val("ed-rest-notes"),
  };

  editingDraft.plating_notes = val("ed-plating-notes");
  editingDraft.chef_notes = val("ed-chef-notes");
}

function renderRecipeEditor() {
  const container = document.getElementById("recipe-detail-container");
  if (!container || !editingDraft) return;

  const d = editingDraft;
  const otherRecipes = allRecipes.filter((r) => r.id !== editingOriginalId);

  container.innerHTML = `
    <div class="p-6 sm:p-8 space-y-8 bg-stone-50/40">
      <div class="flex items-center justify-between border-b border-stone-200 pb-4">
        <div>
          <h2 class="font-serif-title text-2xl font-bold text-stone-900">
            ${editingOriginalId ? `Editar Receta: ${escapeHtml(d.title)}` : "Nueva Ficha Técnica de Receta"}
          </h2>
          <p class="text-xs text-stone-500">Se guardará como archivo Markdown (.md) con cabecera YAML en <code class="font-mono-tech">data/recipes/</code></p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="cancelRecipeEditor()"
            class="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-300 rounded-lg">
            Cancelar
          </button>
          <button onclick="saveRecipeFromEditor()"
            class="px-5 py-2 text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded-lg shadow">
            💾 Guardar Receta (.md)
          </button>
        </div>
      </div>

      <!-- 1. Datos Generales -->
      <section class="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">1. Identificación y Clasificación</h3>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div class="md:col-span-8">
            <label class="block text-xs font-semibold text-stone-700 mb-1">Nombre del Plato o Elaboración *</label>
            <input id="ed-title" type="text" value="${escapeHtml(d.title)}" placeholder="Ej. Arroz Meloso de Pato y Perrechicos"
              class="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-medium" />
          </div>
          <div class="md:col-span-4">
            <label class="block text-xs font-semibold text-stone-700 mb-1">Categoría</label>
            <input id="ed-category" list="category-suggestions" value="${escapeHtml(d.category)}"
              class="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            <datalist id="category-suggestions">
              <option value="Entrante"></option>
              <option value="Principal"></option>
              <option value="Fondo / Base"></option>
              <option value="Salsa / Emulsión"></option>
              <option value="Panadería / Masa"></option>
              <option value="Guarnición"></option>
              <option value="Postre"></option>
            </datalist>
          </div>

          <div class="md:col-span-8">
            <label class="block text-xs font-semibold text-stone-700 mb-1">Subtítulo / Descripción Gastronómica</label>
            <input id="ed-subtitle" type="text" value="${escapeHtml(d.subtitle)}" placeholder="Breve descripción técnica del plato..."
              class="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div class="md:col-span-4 flex items-end pb-1">
            <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-800 bg-stone-100 px-3 py-2.5 rounded-lg border border-stone-200 w-full">
              <input id="ed-is-subrecipe" type="checkbox" ${d.is_subrecipe ? "checked" : ""} class="w-4 h-4 accent-amber-700" />
              <span>Es una Sub-receta / Elaboración Base</span>
            </label>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Rendimiento (Cant.)</label>
            <input id="ed-servings" type="number" step="any" value="${d.servings}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Unidad Rendimiento</label>
            <input id="ed-yield-unit" type="text" value="${escapeHtml(d.yield_unit)}" placeholder="raciones, ml, g, hogazas"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Modo de Escalado</label>
            <select id="ed-scaling-mode" class="w-full px-2.5 py-1.5 text-sm border border-stone-300 rounded-lg bg-white">
              <option value="servings" ${d.scaling_mode === "servings" ? "selected" : ""}>Por Raciones / Rendimiento</option>
              <option value="bakers_pct" ${d.scaling_mode === "bakers_pct" ? "selected" : ""}>Porcentaje Panadero (100%)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Dificultad (1-5)</label>
            <input id="ed-difficulty" type="number" min="1" max="5" value="${d.difficulty}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Valoración (0-5)</label>
            <input id="ed-rating" type="number" step="0.1" min="0" max="5" value="${d.rating}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Técnicas (separadas por coma)</label>
            <input id="ed-techniques" type="text" value="${escapeHtml((d.techniques || []).join(", "))}"
              placeholder="Baja temperatura, Maillard, Emulsión..."
              class="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Etiquetas / Tags (sep. por coma)</label>
            <input id="ed-tags" type="text" value="${escapeHtml((d.tags || []).join(", "))}"
              placeholder="otoño, caza, arroz, sin-gluten..."
              class="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Foto de Emplatado Principal</label>
            <div class="flex items-center gap-2">
              <input id="ed-cover-photo" type="text" value="${escapeHtml(d.cover_photo || "")}" placeholder="/media/foto.jpg"
                class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg font-mono-tech" />
              <label class="px-2.5 py-1.5 bg-stone-800 text-white text-xs rounded-lg cursor-pointer shrink-0 hover:bg-stone-700">
                📷 Subir
                <input type="file" accept="image/*" class="hidden" onchange="uploadCoverPhoto(this)" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. UTENSILIOS OBLIGATORIOS Y OPCIONALES -->
      <section class="bg-white border border-amber-300 rounded-2xl p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-amber-900">
              2. Utensilios y Equipamiento (Obligatorios vs Opcionales)
            </h3>
            <p class="text-xs text-stone-500">Marca si el utensilio es imprescindible u opcional e indica posibles sustitutos.</p>
          </div>
          <div class="flex items-center gap-2">
            <select id="ed-add-utensil-select" class="px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white">
              <option value="">+ Seleccionar utensilio de mi catálogo...</option>
              ${utensilsCatalog
                .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} (${escapeHtml(u.category)})</option>`)
                .join("")}
            </select>
            <button type="button" onclick="editorAddUtensilFromCatalog()"
              class="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-600">
              Añadir a receta
            </button>
            <button type="button" onclick="editorAddCustomUtensil()"
              class="px-3 py-1.5 text-xs font-medium bg-stone-100 border border-stone-300 text-stone-800 rounded-lg hover:bg-stone-200">
              + Nuevo libre
            </button>
          </div>
        </div>

        <div class="space-y-2">
          ${
            (d.utensils || []).length === 0
              ? `<p class="text-xs text-stone-400 italic">Añade los utensilios que intervienen en la receta.</p>`
              : (d.utensils || [])
                  .map(
                    (u, idx) => `
                  <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-xl border ${
                    u.mandatory ? "bg-amber-50/60 border-amber-300" : "bg-stone-50 border-stone-200"
                  }">
                    <div class="sm:col-span-4">
                      <input type="text" value="${escapeHtml(u.name)}"
                        oninput="editingDraft.utensils[${idx}].name = this.value"
                        placeholder="Nombre del utensilio"
                        class="w-full px-2.5 py-1.5 text-xs font-semibold border border-stone-300 rounded-lg bg-white" />
                    </div>
                    <div class="sm:col-span-3">
                      <select onchange="editingDraft.utensils[${idx}].mandatory = (this.value === 'true'); syncDraftScalarsFromDOM(); renderRecipeEditor();"
                        class="w-full px-2.5 py-1.5 text-xs font-mono-tech font-bold rounded-lg border ${
                          u.mandatory
                            ? "bg-amber-800 text-white border-amber-900"
                            : "bg-stone-200 text-stone-800 border-stone-300"
                        }">
                        <option value="true" ${u.mandatory ? "selected" : ""}>● OBLIGATORIO</option>
                        <option value="false" ${!u.mandatory ? "selected" : ""}>◌ OPCIONAL / SUSTITUIBLE</option>
                      </select>
                    </div>
                    <div class="sm:col-span-4">
                      <input type="text" value="${escapeHtml(u.notes || "")}"
                        oninput="editingDraft.utensils[${idx}].notes = this.value"
                        placeholder="${u.mandatory ? "Uso técnico (ej. Sonda para 62°C)" : "Sustituto (ej. Olla exprés 25 min)"}"
                        class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white" />
                    </div>
                    <div class="sm:col-span-1 text-right">
                      <button type="button" onclick="editingDraft.utensils.splice(${idx}, 1); syncDraftScalarsFromDOM(); renderRecipeEditor();"
                        class="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs">✕</button>
                    </div>
                  </div>
                `
                  )
                  .join("")
          }
        </div>
      </section>

      <!-- 3. TIEMPOS Y TEMPERATURAS -->
      <section class="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">3. Control de Tiempos y Temperaturas</h3>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Prep / Mise en place (min)</label>
            <input id="ed-prep-min" type="number" min="0" value="${d.timings?.prep_minutes || 0}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Cocción (min)</label>
            <input id="ed-cook-min" type="number" min="0" value="${d.timings?.cook_minutes || 0}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Reposo / Fermentación (min)</label>
            <input id="ed-rest-min" type="number" min="0" value="${d.timings?.rest_minutes || 0}"
              class="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg font-mono-tech" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Detalle del Reposo</label>
            <input id="ed-rest-notes" type="text" value="${escapeHtml(d.timings?.rest_notes || "")}"
              placeholder="Ej. 16h en cámara a 4°C"
              class="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg" />
          </div>
        </div>

        <div class="pt-2 space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-stone-700">Puntos de Temperatura Crítica (°C)</label>
            <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.temperatures.push({stage:'', temp_c: 100, notes:''}); renderRecipeEditor();"
              class="px-2.5 py-1 text-xs font-medium bg-stone-100 hover:bg-stone-200 rounded-lg border border-stone-300">
              + Añadir punto térmico
            </button>
          </div>
          ${(d.temperatures || [])
            .map(
              (tp, idx) => `
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div class="sm:col-span-5">
                <input type="text" value="${escapeHtml(tp.stage)}"
                  oninput="editingDraft.temperatures[${idx}].stage = this.value"
                  placeholder="Fase (ej. Sonda al corazón, Horno con vapor)"
                  class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg" />
              </div>
              <div class="sm:col-span-2">
                <div class="flex items-center">
                  <input type="number" step="0.5" value="${tp.temp_c}"
                    oninput="editingDraft.temperatures[${idx}].temp_c = parseFloat(this.value) || 0"
                    class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-l-lg font-mono-tech font-bold" />
                  <span class="px-2 py-1.5 text-xs bg-stone-100 border border-l-0 border-stone-300 rounded-r-lg font-mono-tech">°C</span>
                </div>
              </div>
              <div class="sm:col-span-4">
                <input type="text" value="${escapeHtml(tp.notes || "")}"
                  oninput="editingDraft.temperatures[${idx}].notes = this.value"
                  placeholder="Notas térmicas"
                  class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg" />
              </div>
              <div class="sm:col-span-1 text-right">
                <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.temperatures.splice(${idx}, 1); renderRecipeEditor();"
                  class="text-red-600 px-2 py-1 text-xs">✕</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <!-- 4. INGREDIENTES Y SUB-RECETAS VINCULADAS -->
      <section class="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">
              4. Escandallo de Ingredientes y Sub-recetas
            </h3>
            <p class="text-xs text-stone-500">Marca la casilla "Base 100%" en las harinas o ingrediente principal para el cálculo de porcentaje de panadero.</p>
          </div>
          <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.ingredients.push({name:'', amount:100, unit:'g', group:'Principal', is_base_weight:false, notes:''}); renderRecipeEditor();"
            class="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-600">
            + Añadir Ingrediente
          </button>
        </div>

        <div class="space-y-2">
          ${(d.ingredients || [])
            .map(
              (ing, idx) => `
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-stone-50/70 p-2 rounded-xl border border-stone-200/80">
              <div class="sm:col-span-3">
                <input type="text" value="${escapeHtml(ing.name)}"
                  oninput="editingDraft.ingredients[${idx}].name = this.value"
                  placeholder="Ingrediente"
                  class="w-full px-2.5 py-1.5 text-xs font-medium border border-stone-300 rounded-lg bg-white" />
              </div>
              <div class="sm:col-span-2 flex gap-1">
                <input type="number" step="any" value="${ing.amount ?? ""}"
                  oninput="editingDraft.ingredients[${idx}].amount = this.value === '' ? null : parseFloat(this.value)"
                  placeholder="Cant."
                  class="w-2/3 px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
                <input type="text" value="${escapeHtml(ing.unit || "g")}"
                  oninput="editingDraft.ingredients[${idx}].unit = this.value"
                  placeholder="ud/g"
                  class="w-1/3 px-1.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
              </div>
              <div class="sm:col-span-2">
                <input type="text" value="${escapeHtml(ing.group || "Principal")}"
                  oninput="editingDraft.ingredients[${idx}].group = this.value"
                  placeholder="Grupo (ej. Sofrito)"
                  class="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white" />
              </div>
              <div class="sm:col-span-3">
                <input type="text" value="${escapeHtml(ing.notes || "")}"
                  oninput="editingDraft.ingredients[${idx}].notes = this.value"
                  placeholder="Corte o nota técnica (brunoise...)"
                  class="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white" />
              </div>
              <div class="sm:col-span-2 flex items-center justify-end gap-2">
                <label class="flex items-center gap-1 text-[11px] font-mono-tech text-amber-900 cursor-pointer" title="Incluir en el 100% de peso base">
                  <input type="checkbox" ${ing.is_base_weight ? "checked" : ""}
                    onchange="editingDraft.ingredients[${idx}].is_base_weight = this.checked"
                    class="accent-amber-700" />
                  <span>100%</span>
                </label>
                <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.ingredients.splice(${idx}, 1); renderRecipeEditor();"
                  class="text-red-600 px-1.5 py-1 text-xs">✕</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <!-- Sub-recetas vinculadas -->
        <div class="pt-3 border-t border-stone-200 space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-stone-700">🔗 Sub-recetas / Elaboraciones Previas Vinculadas</label>
            <div class="flex items-center gap-2">
              <select id="ed-add-subrecipe-select" class="px-2.5 py-1 text-xs border border-stone-300 rounded-lg bg-white">
                <option value="">Seleccionar receta existente...</option>
                ${otherRecipes
                  .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)}</option>`)
                  .join("")}
              </select>
              <button type="button" onclick="editorAddSubrecipe()"
                class="px-2.5 py-1 text-xs font-medium bg-stone-800 text-white rounded-lg">
                + Vincular
              </button>
            </div>
          </div>

          ${(d.subrecipes || [])
            .map(
              (sr, idx) => `
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-amber-50/50 p-2 rounded-xl border border-amber-200">
              <div class="sm:col-span-4 text-xs font-semibold text-stone-800 px-2">${escapeHtml(sr.name)}</div>
              <div class="sm:col-span-3 flex gap-1">
                <input type="number" step="any" value="${sr.amount ?? ""}"
                  oninput="editingDraft.subrecipes[${idx}].amount = this.value === '' ? null : parseFloat(this.value)"
                  placeholder="Cantidad"
                  class="w-2/3 px-2 py-1 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
                <input type="text" value="${escapeHtml(sr.unit || "ml")}"
                  oninput="editingDraft.subrecipes[${idx}].unit = this.value"
                  class="w-1/3 px-2 py-1 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
              </div>
              <div class="sm:col-span-4">
                <input type="text" value="${escapeHtml(sr.notes || "")}"
                  oninput="editingDraft.subrecipes[${idx}].notes = this.value"
                  placeholder="Proporción o uso"
                  class="w-full px-2 py-1 text-xs border border-stone-300 rounded-lg bg-white" />
              </div>
              <div class="sm:col-span-1 text-right">
                <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.subrecipes.splice(${idx}, 1); renderRecipeEditor();"
                  class="text-red-600 px-2 py-1 text-xs">✕</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <!-- 5. PROCEDIMIENTO PASO A PASO -->
      <section class="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-stone-700">5. Procedimiento Paso a Paso</h3>
          <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.steps.push({order: editingDraft.steps.length + 1, title:'', instruction:'', duration_minutes:null, temp_c:null, critical_point:'', photo:''}); renderRecipeEditor();"
            class="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-600">
            + Añadir Paso
          </button>
        </div>

        <div class="space-y-3">
          ${(d.steps || [])
            .map(
              (st, idx) => `
            <div class="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div class="sm:col-span-1 font-mono-tech font-bold text-xs text-stone-500">Paso #${idx + 1}</div>
                <div class="sm:col-span-5">
                  <input type="text" value="${escapeHtml(st.title || "")}"
                    oninput="editingDraft.steps[${idx}].title = this.value"
                    placeholder="Título del paso (ej. Nacrado del grano, Autólisis)"
                    class="w-full px-2.5 py-1.5 text-xs font-semibold border border-stone-300 rounded-lg bg-white" />
                </div>
                <div class="sm:col-span-2">
                  <input type="number" min="0" value="${st.duration_minutes ?? ""}"
                    oninput="editingDraft.steps[${idx}].duration_minutes = this.value === '' ? null : parseInt(this.value, 10)"
                    placeholder="⏱ Minutos"
                    class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
                </div>
                <div class="sm:col-span-2">
                  <input type="number" step="0.5" value="${st.temp_c ?? ""}"
                    oninput="editingDraft.steps[${idx}].temp_c = this.value === '' ? null : parseFloat(this.value)"
                    placeholder="🌡 Temp °C"
                    class="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
                </div>
                <div class="sm:col-span-2 text-right">
                  <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.steps.splice(${idx}, 1); renderRecipeEditor();"
                    class="text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded">Eliminar paso</button>
                </div>
              </div>

              <textarea rows="2" oninput="editingDraft.steps[${idx}].instruction = this.value"
                placeholder="Instrucción técnica detallada..."
                class="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white">${escapeHtml(st.instruction || "")}</textarea>

              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div class="sm:col-span-8">
                  <input type="text" value="${escapeHtml(st.critical_point || "")}"
                    oninput="editingDraft.steps[${idx}].critical_point = this.value"
                    placeholder="⚡ Punto Crítico de Control (PCC) / Consejo de chef en este paso"
                    class="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-amber-50/40" />
                </div>
                <div class="sm:col-span-4 flex items-center gap-1.5">
                  <input type="text" value="${escapeHtml(st.photo || "")}"
                    oninput="editingDraft.steps[${idx}].photo = this.value"
                    placeholder="URL foto del paso"
                    class="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-mono-tech" />
                  <label class="px-2 py-1.5 bg-stone-800 text-white text-xs rounded-lg cursor-pointer shrink-0">
                    📷
                    <input type="file" accept="image/*" class="hidden" onchange="uploadStepPhoto(this, ${idx})" />
                  </label>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <!-- 6. EMPLATADO Y NOTAS DEL CHEF -->
      <section class="bg-white border border-stone-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-mono-tech uppercase font-bold text-stone-700 mb-1">6. Emplatado, Acabado y Servicio</label>
          <textarea id="ed-plating-notes" rows="3" placeholder="Vajilla recomendada, disposición de elementos, temperatura de pase..."
            class="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg">${escapeHtml(d.plating_notes || "")}</textarea>
        </div>
        <div>
          <label class="block text-xs font-mono-tech uppercase font-bold text-stone-700 mb-1">7. Notas Técnicas, Conservación y Regeneración</label>
          <textarea id="ed-chef-notes" rows="3" placeholder="Caducidad en cámara, regeneración en roner o vapor, variantes..."
            class="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg">${escapeHtml(d.chef_notes || "")}</textarea>
        </div>
      </section>

      <div class="flex justify-end gap-3 pt-2">
        <button onclick="cancelRecipeEditor()"
          class="px-4 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-lg">
          Cancelar
        </button>
        <button onclick="saveRecipeFromEditor()"
          class="px-6 py-2.5 text-sm font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded-lg shadow">
          💾 Guardar Receta en Markdown
        </button>
      </div>
    </div>
  `;
}

function editorAddUtensilFromCatalog() {
  syncDraftScalarsFromDOM();
  const sel = document.getElementById("ed-add-utensil-select");
  const uId = sel?.value;
  if (!uId) return;
  const catItem = utensilsCatalog.find((u) => u.id === uId);
  if (!catItem) return;
  editingDraft.utensils.push({
    utensil_id: catItem.id,
    name: catItem.name,
    mandatory: true,
    notes: "",
  });
  renderRecipeEditor();
}

function editorAddCustomUtensil() {
  syncDraftScalarsFromDOM();
  editingDraft.utensils.push({
    utensil_id: "utensilio-" + Date.now(),
    name: "",
    mandatory: true,
    notes: "",
  });
  renderRecipeEditor();
}

function editorAddSubrecipe() {
  syncDraftScalarsFromDOM();
  const sel = document.getElementById("ed-add-subrecipe-select");
  const rId = sel?.value;
  if (!rId) return;
  const target = allRecipes.find((r) => r.id === rId);
  if (!target) return;
  editingDraft.subrecipes.push({
    recipe_id: target.id,
    name: target.title,
    amount: target.servings || 250,
    unit: target.yield_unit || "ml",
    notes: "",
  });
  renderRecipeEditor();
}

async function uploadCoverPhoto(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  syncDraftScalarsFromDOM();
  const formData = new FormData();
  formData.append("file", inputEl.files[0]);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (res.ok) {
    const data = await res.json();
    editingDraft.cover_photo = data.url;
    renderRecipeEditor();
  }
}

async function uploadStepPhoto(inputEl, stepIdx) {
  if (!inputEl.files || !inputEl.files[0]) return;
  syncDraftScalarsFromDOM();
  const formData = new FormData();
  formData.append("file", inputEl.files[0]);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (res.ok) {
    const data = await res.json();
    editingDraft.steps[stepIdx].photo = data.url;
    renderRecipeEditor();
  }
}

async function saveRecipeFromEditor() {
  syncDraftScalarsFromDOM();
  if (!editingDraft.title.trim()) {
    alert("El nombre de la receta es obligatorio.");
    return;
  }
  // Limpiar ingredientes vacíos
  editingDraft.ingredients = (editingDraft.ingredients || []).filter((i) => i.name && i.name.trim());
  editingDraft.steps = (editingDraft.steps || []).filter((s) => (s.instruction && s.instruction.trim()) || (s.title && s.title.trim()));
  editingDraft.temperatures = (editingDraft.temperatures || []).filter((t) => t.stage && t.stage.trim());
  editingDraft.utensils = (editingDraft.utensils || []).filter((u) => u.name && u.name.trim());

  // Si se creó algún utensilio nuevo desde la receta, asegurarnos de que exista en el catálogo maestro
  let catalogChanged = false;
  for (const u of editingDraft.utensils) {
    if (!utensilsCatalog.some((c) => c.id === u.utensil_id)) {
      utensilsCatalog.push({
        id: u.utensil_id,
        name: u.name,
        category: "Cocción",
        owned: true,
        specs: u.notes || "",
      });
      catalogChanged = true;
    }
  }
  if (catalogChanged) {
    await fetch("/api/utensils", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(utensilsCatalog),
    });
  }

  const url = editingOriginalId
    ? `/api/recipes/${encodeURIComponent(editingOriginalId)}`
    : "/api/recipes";
  const method = editingOriginalId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(editingDraft),
  });

  if (res.ok) {
    const saved = await res.json();
    editingDraft = null;
    editingOriginalId = null;
    await loadInitialData(saved.id);
  } else {
    const errText = await res.text();
    alert("Error al guardar la receta: " + errText);
  }
}

function cancelRecipeEditor() {
  editingDraft = null;
  editingOriginalId = null;
  if (activeRecipeId) {
    const r = allRecipes.find((x) => x.id === activeRecipeId);
    if (r) renderRecipeDetail(r);
  } else if (allRecipes.length > 0) {
    selectRecipe(allRecipes[0].id);
  } else {
    renderEmptyState();
  }
}

async function duplicateRecipe(recipeId) {
  const orig = allRecipes.find((r) => r.id === recipeId);
  if (!orig) return;
  const copy = structuredClone(orig);
  copy.id = "";
  copy.title = `${orig.title} (Variante)`;
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(copy),
  });
  if (res.ok) {
    const saved = await res.json();
    await loadInitialData(saved.id);
  }
}

async function confirmDeleteRecipe(recipeId) {
  const r = allRecipes.find((x) => x.id === recipeId);
  if (!r) return;
  if (!confirm(`¿Seguro que quieres eliminar el archivo Markdown de "${r.title}"?`)) return;
  const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, { method: "DELETE" });
  if (res.ok) {
    activeRecipeId = null;
    await loadInitialData();
  }
}

// ============================================================================
// GESTOR DEL INVENTARIO MAESTRO DE UTENSILIOS
// ============================================================================
function openUtensilsModal() {
  const modal = document.getElementById("utensils-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderUtensilsCatalogModal();
}

function closeUtensilsModal() {
  const modal = document.getElementById("utensils-modal");
  if (modal) modal.classList.add("hidden");
}

function renderUtensilsCatalogModal() {
  const container = document.getElementById("utensils-catalog-list");
  if (!container) return;

  const byCat = {};
  for (const u of utensilsCatalog) {
    byCat[u.category || "General"] = byCat[u.category || "General"] || [];
    byCat[u.category || "General"].push(u);
  }

  container.innerHTML = Object.entries(byCat)
    .map(
      ([cat, items]) => `
      <div class="space-y-2">
        <h3 class="text-xs font-mono-tech uppercase tracking-wider font-bold text-amber-900 border-b border-stone-200 pb-1">
          ${escapeHtml(cat)} (${items.length})
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${items
            .map(
              (u) => `
            <div class="p-3 rounded-xl border flex items-center justify-between gap-3 ${
              u.owned ? "bg-white border-stone-200" : "bg-stone-100/70 border-stone-200 opacity-75"
            }">
              <label class="flex items-start gap-2.5 cursor-pointer flex-1">
                <input type="checkbox" ${u.owned ? "checked" : ""}
                  onchange="toggleCatalogUtensilOwned('${escapeHtml(u.id)}', this.checked)"
                  class="mt-1 w-4 h-4 accent-amber-700 rounded" />
                <div>
                  <div class="text-xs font-bold text-stone-900">${escapeHtml(u.name)}</div>
                  ${
                    u.specs
                      ? `<div class="text-[11px] text-stone-500">${escapeHtml(u.specs)}</div>`
                      : ""
                  }
                </div>
              </label>
              <button onclick="deleteCatalogUtensil('${escapeHtml(u.id)}')"
                class="text-stone-400 hover:text-red-600 text-xs px-1.5 py-0.5" title="Eliminar del catálogo">
                🗑
              </button>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
    )
    .join("");
}

async function toggleCatalogUtensilOwned(utensilId, isOwned) {
  const item = utensilsCatalog.find((u) => u.id === utensilId);
  if (!item) return;
  item.owned = isOwned;
  await fetch("/api/utensils", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(utensilsCatalog),
  });
  updateUtensilHeaderCounter();
  populateFilterDropdowns();
  applyFilters();
  renderUtensilsCatalogModal();
  const r = allRecipes.find((x) => x.id === activeRecipeId);
  if (r) renderRecipeDetail(r);
}

async function addNewCatalogUtensil() {
  const nameEl = document.getElementById("new-utensil-name");
  const catEl = document.getElementById("new-utensil-category");
  const specsEl = document.getElementById("new-utensil-specs");
  const name = (nameEl?.value || "").trim();
  if (!name) return;

  const res = await fetch("/api/utensils", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "",
      name,
      category: catEl?.value || "Cocción",
      owned: true,
      specs: (specsEl?.value || "").trim(),
    }),
  });
  if (res.ok) {
    nameEl.value = "";
    specsEl.value = "";
    const utRes = await fetch("/api/utensils");
    utensilsCatalog = await utRes.json();
    updateUtensilHeaderCounter();
    populateFilterDropdowns();
    renderUtensilsCatalogModal();
  }
}

async function deleteCatalogUtensil(utensilId) {
  utensilsCatalog = utensilsCatalog.filter((u) => u.id !== utensilId);
  await fetch("/api/utensils", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(utensilsCatalog),
  });
  updateUtensilHeaderCounter();
  populateFilterDropdowns();
  renderUtensilsCatalogModal();
}

// ============================================================================
// VISOR / EDITOR DIRECTO DE MARKDOWN (.MD + YAML FRONTMATTER)
// ============================================================================
let currentMdRecipeId = null;

async function openMarkdownModal(recipeId) {
  currentMdRecipeId = recipeId;
  const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/markdown`);
  if (!res.ok) return;
  const text = await res.text();
  document.getElementById("md-modal-filename").textContent = `data/recipes/${recipeId}.md`;
  document.getElementById("raw-markdown-textarea").value = text;
  document.getElementById("markdown-modal").classList.remove("hidden");
}

function closeMarkdownModal() {
  document.getElementById("markdown-modal").classList.add("hidden");
}

async function saveRawMarkdownChanges() {
  if (!currentMdRecipeId) return;
  const content = document.getElementById("raw-markdown-textarea").value;
  const res = await fetch(`/api/recipes/${encodeURIComponent(currentMdRecipeId)}/markdown`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (res.ok) {
    const updated = await res.json();
    closeMarkdownModal();
    await loadInitialData(updated.id);
  } else {
    alert("Error al parsear el YAML Frontmatter del archivo Markdown.");
  }
}

function downloadRawMarkdown() {
  if (!currentMdRecipeId) return;
  const content = document.getElementById("raw-markdown-textarea").value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentMdRecipeId}.md`;
  a.click();
}

function copyRawMarkdown() {
  const content = document.getElementById("raw-markdown-textarea").value;
  navigator.clipboard.writeText(content);
}

function renderEmptyState() {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="p-16 text-center space-y-3">
      <div class="text-4xl">📖</div>
      <h2 class="font-serif-title text-2xl font-bold text-stone-800">Tu recetario está listo</h2>
      <p class="text-sm text-stone-500 max-w-md mx-auto">
        Selecciona una receta en el panel izquierdo o crea una nueva ficha técnica en Markdown + YAML.
      </p>
      <button onclick="openRecipeEditor(null)"
        class="px-4 py-2 bg-amber-700 text-white text-xs font-semibold rounded-lg hover:bg-amber-600">
        ＋ Crear primera receta
      </button>
    </div>
  `;
}

// Utilidades de formato
function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return "";
  const rounded = Math.round(Number(val) * 100) / 100;
  return rounded.toString();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
