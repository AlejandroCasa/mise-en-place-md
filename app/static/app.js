// ============================================================================
// Mise en Place MD — Atelier Culinario Frontend
// ============================================================================

const ICONS = {
  code: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12"/></svg>`,
  print: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`,
  copy: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  clock: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  wine: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8l1 6a5 5 0 0 1-10 0L8 2Z"/><path d="M12 13v8M8 21h8"/></svg>`,
  external: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`,
  check: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>`,
  pause: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>`,
  play: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>`,
  close: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  plus: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  arrowRight: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  upload: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>`,
  book: `<svg class="icon icon-lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>`,
  chevronRight: `<svg class="icon icon-sm category-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
};

// Canonical Vinum Pulse culinary section order (+ Atelier bases/bakery)
const CANONICAL_CATEGORY_ORDER = [
  "Entrantes y Cuchara",
  "Ensaladas y Huerta",
  "Tapas y Pintxos",
  "Pescados y Mariscos",
  "Arroces",
  "Carnes y Caza",
  "Postres y Dulces",
  "Platos Vegetarianos y Setas",
  "Panadería / Masa",
  "Fondo / Base",
];

const WINE_TYPE_ES = {
  Red: "Tinto",
  White: "Blanco",
  Sparkling: "Espumoso",
  Fortified: "Generoso",
  Rose: "Rosado",
};

const RESOLUTION_SOURCE_ES = {
  linked_dish: "Plato vinculado",
  sensory_profile: "Perfil sensorial",
  tag_affinity: "Afinidad culinaria",
  fallback: "Selección bodega",
};

// Global application state
let allRecipes = [];
let filteredRecipes = [];
let utensilsCatalog = [];
let activeRecipeId = null;
let currentScaleFactor = 1.0;
let currentViewScalingMode = null; // "servings" | "bakers_pct"
let checkedIngredients = new Set();
let checkedSteps = new Set();
let activeTimers = [];
let timerInterval = null;
let wakeLockSentinel = null;
const wineSuggestionCache = new Map();
const openCategories = new Set();
let hasActiveFilters = false;

// ============================================================================
// Bootstrap, Deep Links & Keyboard Shortcuts
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  const deepLinkSlug = extractSlugFromPath();
  await loadInitialData(deepLinkSlug);
  setupKeyboardShortcuts();
});

window.addEventListener("popstate", () => {
  const slug = extractSlugFromPath();
  if (slug && allRecipes.some((r) => r.id === slug)) {
    selectRecipe(slug, { pushHistory: false });
  }
});

function extractSlugFromPath() {
  const match = window.location.pathname.match(/^\/recipes\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const tag = (event.target?.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select";

    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      document.getElementById("filter-search")?.focus();
      return;
    }

    if (event.key === "Escape") {
      closeUtensilsModal();
      closeMarkdownModal();
    }
  });
}

async function loadInitialData(selectId = null) {
  try {
    const [recipesRes, utensilsRes] = await Promise.all([
      fetch("/api/recipes"),
      fetch("/api/utensils"),
    ]);
    allRecipes = await recipesRes.json();
    utensilsCatalog = await utensilsRes.json();
  } catch (err) {
    renderErrorState("No se pudo conectar con la API de Atelier Culinario.");
    return;
  }

  updateUtensilHeaderCounter();
  populateFilterDropdowns();
  applyFilters();

  if (selectId && allRecipes.some((r) => r.id === selectId)) {
    selectRecipe(selectId, { pushHistory: false });
  } else if (activeRecipeId && allRecipes.some((r) => r.id === activeRecipeId)) {
    selectRecipe(activeRecipeId, { pushHistory: false });
  } else if (filteredRecipes.length > 0) {
    selectRecipe(filteredRecipes[0].id, { pushHistory: false });
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
  if (!catSelect || !utSelect || !techSelect) return;

  const currentCat = catSelect.value;
  const currentUt = utSelect.value;
  const currentTech = techSelect.value;

  const categories = sortCategoriesCanonical(
    Array.from(new Set(allRecipes.map((r) => r.category).filter(Boolean)))
  );
  catSelect.innerHTML =
    `<option value="">Todas</option>` +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  catSelect.value = currentCat;

  const sortedUtensils = [...utensilsCatalog].sort((a, b) => a.name.localeCompare(b.name));
  utSelect.innerHTML =
    `<option value="">Cualquiera</option>` +
    sortedUtensils
      .map(
        (u) =>
          `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}${u.owned ? "" : " (sin disp.)"}</option>`
      )
      .join("");
  utSelect.value = currentUt;

  const techniques = Array.from(
    new Set(allRecipes.flatMap((r) => r.techniques || []).filter(Boolean))
  ).sort();
  techSelect.innerHTML =
    `<option value="">Todas</option>` +
    techniques.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  techSelect.value = currentTech;
}

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

// ============================================================================
// Filtering & Sorting
// ============================================================================
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

  hasActiveFilters = Boolean(
    q || cookableToday || ingIncludeRaw || ingExcludeRaw || cat || subType !== "all" || utensilId || technique
  );
  const clearBtn = document.getElementById("search-clear-btn");
  const kbdHint = document.getElementById("search-kbd-hint");
  if (clearBtn && kbdHint) {
    clearBtn.classList.toggle("is-hidden", !hasActiveFilters);
    kbdHint.classList.toggle("is-hidden", hasActiveFilters);
  }

  const includeTerms = ingIncludeRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const excludeTerms = ingExcludeRaw.split(",").map((s) => s.trim()).filter(Boolean);

  filteredRecipes = allRecipes.filter((r) => {
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

    if (cookableToday && !checkRecipeEquipmentStatus(r).canCookMandatory) return false;

    if (includeTerms.length > 0) {
      const ingText = (r.ingredients || []).map((i) => `${i.name} ${i.notes}`).join(" ").toLowerCase();
      for (const term of includeTerms) {
        if (!ingText.includes(term)) return false;
      }
    }

    if (excludeTerms.length > 0) {
      const ingText = (r.ingredients || []).map((i) => `${i.name} ${i.notes}`).join(" ").toLowerCase();
      for (const term of excludeTerms) {
        if (ingText.includes(term)) return false;
      }
    }

    if (cat && r.category !== cat) return false;
    if (subType === "main" && r.is_subrecipe) return false;
    if (subType === "sub" && !r.is_subrecipe) return false;
    if (utensilId && !(r.utensils || []).some((u) => u.utensil_id === utensilId)) return false;
    if (technique && !(r.techniques || []).includes(technique)) return false;

    return true;
  });

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
    countLabel.textContent =
      filteredRecipes.length === allRecipes.length
        ? `${allRecipes.length} recetas`
        : `${filteredRecipes.length} de ${allRecipes.length}`;
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

function sortCategoriesCanonical(categories) {
  return [...categories].sort((a, b) => {
    const idxA = CANONICAL_CATEGORY_ORDER.indexOf(a);
    const idxB = CANONICAL_CATEGORY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, "es");
  });
}

function handleCategoryToggle(detailsEl, categoryName) {
  if (hasActiveFilters) return;
  if (detailsEl.open) openCategories.add(categoryName);
  else openCategories.delete(categoryName);
}

// ============================================================================
// Left Rail Recipe List (Collapsible Vinum Pulse Categories)
// ============================================================================
function renderRecipeList() {
  const container = document.getElementById("recipe-list-container");
  if (!container) return;

  if (filteredRecipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <p style="font-size: 13px; color: var(--ink-secondary);">Ninguna receta coincide con los filtros.</p>
        <button type="button" onclick="resetAllFilters()" class="btn btn-secondary btn-sm">
          Restablecer filtros
        </button>
      </div>
    `;
    return;
  }

  const grouped = new Map();
  for (const r of filteredRecipes) {
    const cat = r.category || "Sin categoría";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(r);
  }

  const orderedCategories = sortCategoriesCanonical(Array.from(grouped.keys()));

  if (openCategories.size === 0 && orderedCategories.length > 0) {
    const activeRec = filteredRecipes.find((r) => r.id === activeRecipeId);
    openCategories.add(activeRec?.category || orderedCategories[0]);
  }

  container.innerHTML = orderedCategories
    .map((category) => {
      const items = grouped.get(category) || [];
      const isOpen = hasActiveFilters || openCategories.has(category);
      const safeCatAttr = escapeHtml(category).replace(/'/g, "\\'");

      const rowsHtml = items
        .map((r) => {
          const isSelected = r.id === activeRecipeId;
          const eq = checkRecipeEquipmentStatus(r);
          const activeTime = (r.timings?.prep_minutes || 0) + (r.timings?.cook_minutes || 0);

          return `
            <button
              type="button"
              onclick="selectRecipe('${escapeHtml(r.id)}')"
              class="recipe-list-item ${isSelected ? "is-selected" : ""}"
              aria-current="${isSelected ? "true" : "false"}"
            >
              <div class="recipe-item-top">
                <div class="recipe-item-title-wrap">
                  ${isSelected ? `<span class="active-dot" aria-hidden="true"></span>` : ""}
                  <span class="recipe-item-title">${escapeHtml(r.title)}</span>
                </div>
                <span class="recipe-item-rating">${(r.rating || 0).toFixed(1)}</span>
              </div>

              ${r.subtitle ? `<span class="recipe-item-sub">${escapeHtml(r.subtitle)}</span>` : ""}

              <div class="recipe-item-meta">
                <div class="recipe-item-tags">
                  ${r.is_subrecipe ? `<span class="meta-pill meta-pill-dark">Base</span>` : ""}
                  ${r.scaling_mode === "bakers_pct" ? `<span class="meta-pill">% Pan</span>` : ""}
                  <span>${formatDuration(activeTime)}</span>
                </div>
                ${
                  !eq.canCookMandatory
                    ? `<span class="meta-pill meta-pill-alert">Falta equipo</span>`
                    : `<span>Dif ${r.difficulty || 1}/5</span>`
                }
              </div>
            </button>
          `;
        })
        .join("");

      return `
        <details class="category-group" ${isOpen ? "open" : ""} ontoggle="handleCategoryToggle(this, '${safeCatAttr}')">
          <summary class="category-group-summary">
            <span class="category-group-title">
              ${ICONS.chevronRight}
              <span>${escapeHtml(category)}</span>
            </span>
            <span class="category-group-count">${items.length}</span>
          </summary>
          <div class="category-group-items">
            ${rowsHtml}
          </div>
        </details>
      `;
    })
    .join("");
}

function selectRecipe(recipeId, { pushHistory = true } = {}) {
  const recipe = allRecipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  activeRecipeId = recipeId;
  if (recipe.category) {
    openCategories.add(recipe.category);
  }
  currentScaleFactor = 1.0;
  currentViewScalingMode = recipe.scaling_mode || "servings";
  checkedIngredients.clear();
  checkedSteps.clear();

  if (pushHistory) {
    const targetPath = `/recipes/${encodeURIComponent(recipeId)}`;
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, "", targetPath);
    }
  }

  renderRecipeList();
  renderRecipeDetail(recipe);
  loadWineSuggestion(recipeId);
}

// ============================================================================
// Live Vinum Pulse Pairing Bridge
// ============================================================================
async function loadWineSuggestion(recipeId) {
  const slot = document.getElementById("vinum-pairing-slot");
  if (!slot) return;

  if (wineSuggestionCache.has(recipeId)) {
    renderWineSuggestionSlot(slot, wineSuggestionCache.get(recipeId));
    return;
  }

  slot.innerHTML = `
    <div class="vinum-strip">
      <div class="vinum-strip-header">
        <span class="vinum-heading">${ICONS.wine} <span>Maridaje Vinum Pulse</span></span>
        <span class="vinum-source-badge">Consultando bodega...</span>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/wine-suggestion`);
    if (!res.ok) {
      wineSuggestionCache.set(recipeId, null);
      if (activeRecipeId === recipeId) renderWineSuggestionSlot(slot, null);
      return;
    }
    const data = await res.json();
    wineSuggestionCache.set(recipeId, data);
    if (activeRecipeId === recipeId) {
      renderWineSuggestionSlot(slot, data);
    }
  } catch {
    if (activeRecipeId === recipeId) renderWineSuggestionSlot(slot, null);
  }
}

function renderWineSuggestionSlot(slot, data) {
  if (!slot) return;
  if (!data || !data.recommended_wine) {
    slot.innerHTML = `
      <div class="vinum-strip">
        <div class="vinum-strip-header">
          <span class="vinum-heading">${ICONS.wine} <span>Maridaje Vinum Pulse</span></span>
          <span class="vinum-source-badge">Sin catálogo cargado</span>
        </div>
        <p style="font-size: 12.5px; color: var(--ink-secondary);">
          Ejecuta el seed de <code class="font-mono">enology.wines</code> en Vinum Pulse para activar la sugerencia automática de vino de gama media para esta receta.
        </p>
      </div>
    `;
    return;
  }

  const wine = data.recommended_wine;
  const wineTypeEs = WINE_TYPE_ES[data.dominant_wine_type] || data.dominant_wine_type;
  const sourceEs = RESOLUTION_SOURCE_ES[data.resolution_source] || data.resolution_source;
  const band = Array.isArray(data.mid_price_band_eur)
    ? `${formatNumber(data.mid_price_band_eur[0])}–${formatNumber(data.mid_price_band_eur[1])} €`
    : `${formatNumber(data.median_price_eur)} €`;

  const alternativesHtml =
    data.alternatives && data.alternatives.length > 0
      ? `
        <div class="vinum-alts">
          <span style="font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-tertiary);">Alternativas</span>
          ${data.alternatives
            .slice(0, 3)
            .map(
              (alt) => `
                <a href="${escapeHtml(alt.vinum_url)}" target="_blank" rel="noopener noreferrer" class="vinum-alt-link">
                  <span>${escapeHtml(alt.name)}</span>
                  <span class="font-mono" style="color: var(--ink-tertiary);">${formatNumber(alt.price_eur)} €</span>
                </a>
              `
            )
            .join("")}
        </div>
      `
      : "";

  slot.innerHTML = `
    <section class="vinum-strip" aria-label="Maridaje sugerido por Vinum Pulse">
      <div class="vinum-strip-header">
        <span class="vinum-heading">
          ${ICONS.wine}
          <span>Maridaje Sugerido · ${escapeHtml(wineTypeEs)}</span>
        </span>
        <span class="vinum-source-badge">${escapeHtml(sourceEs)} · Banda ${escapeHtml(band)}</span>
      </div>

      <div class="vinum-main-grid">
        <div>
          <div class="vinum-wine-name">${escapeHtml(wine.name)} <span class="font-mono" style="font-size: 14px; font-weight: 500; color: var(--ink-tertiary);">${escapeHtml(wine.vintage)}</span></div>
          <div class="vinum-wine-origin">${escapeHtml(wine.winery)} · ${escapeHtml(wine.appellation)} (${escapeHtml(wine.country)})</div>
          ${data.rationale ? `<p class="vinum-rationale">${escapeHtml(data.rationale)}</p>` : ""}
        </div>

        <div class="vinum-specs-box">
          <div class="vinum-metrics">
            <div class="vinum-metric">
              <span class="vinum-metric-label">Ref. botella</span>
              <span class="vinum-metric-val">${formatNumber(wine.price_eur)} €</span>
            </div>
            <div class="vinum-metric">
              <span class="vinum-metric-label">Servicio</span>
              <span class="vinum-metric-val">${formatNumber(wine.serving_temp_c)} °C</span>
            </div>
            <div class="vinum-metric">
              <span class="vinum-metric-label">Copa</span>
              <span class="vinum-metric-val">${escapeHtml(wine.glass_type)}</span>
            </div>
          </div>

          <a
            href="${escapeHtml(wine.vinum_url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="vinum-cta no-print"
          >
            <span>Abrir en Vinum Pulse</span>
            ${ICONS.external}
          </a>
        </div>
      </div>

      ${alternativesHtml}
    </section>
  `;
}

// ============================================================================
// Recipe Detail Sheet ("Ficha de Partida")
// ============================================================================
function getBaseWeightTotal(recipe) {
  const baseItems = (recipe.ingredients || []).filter((i) => i.is_base_weight && i.amount);
  if (baseItems.length > 0) {
    return baseItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }
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

  const usedInRecipes = allRecipes.filter((other) =>
    (other.subrecipes || []).some((sr) => sr.recipe_id === recipe.id)
  );

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
    <article class="sheet-container">

      <!-- Cabecera de Ficha Técnica -->
      <header class="sheet-header">
        <div class="sheet-toolbar">
          <div class="sheet-meta-inline">
            <span class="meta-pill ${recipe.is_subrecipe ? "meta-pill-dark" : ""}">
              ${recipe.is_subrecipe ? "Elaboración Base" : escapeHtml(recipe.category)}
            </span>
            <span>Dificultad ${recipe.difficulty}/5</span>
            <span>·</span>
            <span>Nota ${(recipe.rating || 0).toFixed(1)}/5</span>
          </div>

          <div class="sheet-actions no-print">
            <button type="button" onclick="openMarkdownModal('${escapeHtml(recipe.id)}')" class="btn btn-ghost btn-sm" title="Ver o editar fuente Markdown + YAML">
              ${ICONS.code} <span>Markdown</span>
            </button>
            <button type="button" onclick="window.print()" class="btn btn-ghost btn-sm" title="Imprimir ficha técnica">
              ${ICONS.print} <span>Imprimir</span>
            </button>
            <button type="button" onclick="duplicateRecipe('${escapeHtml(recipe.id)}')" class="btn btn-ghost btn-sm" title="Crear variante duplicada">
              ${ICONS.copy} <span>Duplicar</span>
            </button>
            <button type="button" onclick="openRecipeEditor('${escapeHtml(recipe.id)}')" class="btn btn-primary btn-sm">
              ${ICONS.edit} <span>Editar</span>
            </button>
            <button type="button" onclick="confirmDeleteRecipe('${escapeHtml(recipe.id)}')" class="btn btn-danger-ghost btn-sm" aria-label="Eliminar receta" title="Eliminar receta">
              ${ICONS.trash}
            </button>
          </div>
        </div>

        <div class="sheet-hero-grid ${recipe.cover_photo ? "has-photo" : ""}">
          <div>
            <h1 class="sheet-title">${escapeHtml(recipe.title)}</h1>
            ${recipe.subtitle ? `<p class="sheet-subtitle">${escapeHtml(recipe.subtitle)}</p>` : ""}

            ${
              (recipe.techniques && recipe.techniques.length > 0) || (recipe.tags && recipe.tags.length > 0)
                ? `
              <div class="sheet-taxonomy">
                ${(recipe.techniques || []).map((t) => `<span class="tech-tag">${escapeHtml(t)}</span>`).join("")}
                ${(recipe.tags || []).map((tag) => `<span class="hash-tag">#${escapeHtml(tag)}</span>`).join("")}
              </div>
            `
                : ""
            }
          </div>

          ${
            recipe.cover_photo
              ? `
            <div class="sheet-cover-frame">
              <img src="${escapeHtml(recipe.cover_photo)}" alt="${escapeHtml(recipe.title)}" />
            </div>
          `
              : ""
          }
        </div>

        <!-- Banda de Telemetría Culinaria (Hairlines, sin cajas pesadas) -->
        <div class="telemetry-strip">
          <div class="telemetry-cell">
            <span class="telemetry-label">Mise en place</span>
            <span class="telemetry-value">${formatDuration(recipe.timings?.prep_minutes || 0)}</span>
          </div>
          <div class="telemetry-cell">
            <span class="telemetry-label">Cocción activa</span>
            <span class="telemetry-value">${formatDuration(recipe.timings?.cook_minutes || 0)}</span>
          </div>
          <div class="telemetry-cell">
            <span class="telemetry-label">Reposo / Ferm.</span>
            <span class="telemetry-value accent">${formatDuration(recipe.timings?.rest_minutes || 0)}</span>
            ${recipe.timings?.rest_notes ? `<span class="telemetry-note">${escapeHtml(recipe.timings.rest_notes)}</span>` : ""}
          </div>
          <div class="telemetry-cell">
            <span class="telemetry-label">Tiempo total</span>
            <span class="telemetry-value">${formatDuration(totalMin)}</span>
            <span class="telemetry-note">Activo: ${formatDuration(activeMin)}</span>
          </div>
        </div>
      </header>

      <!-- Puente Enológico en Vivo (Vinum Pulse) -->
      <div id="vinum-pairing-slot"></div>

      <!-- Cuerpo Principal Asimétrico: Escandallo (izq) + Procedimiento (der) -->
      <div class="sheet-body-grid">

        <!-- Columna Izquierda: Escalador + Ingredientes + Temperaturas -->
        <div style="display: flex; flex-direction: column; gap: 28px;">

          <!-- Instrumento de Escalado Dinámico -->
          <section class="scaler-instrument" aria-label="Escalado de escandallo">
            <div class="scaler-top">
              <span class="scaler-title">Escandallo & Escalado</span>
              <div class="segmented-toggle no-print" role="group" aria-label="Modo de escalado">
                <button
                  type="button"
                  onclick="switchViewScalingMode('servings')"
                  class="segmented-btn ${currentViewScalingMode === "servings" ? "is-active" : ""}"
                >Raciones</button>
                <button
                  type="button"
                  onclick="switchViewScalingMode('bakers_pct')"
                  class="segmented-btn ${currentViewScalingMode === "bakers_pct" ? "is-active" : ""}"
                >% Panadero</button>
              </div>
            </div>

            ${
              currentViewScalingMode === "servings"
                ? `
              <div class="scaler-controls">
                <div>
                  <span style="font-size: 11px; color: var(--ink-inverse-muted);">Rendimiento (${escapeHtml(recipe.yield_unit)})</span>
                  <div class="scaler-input-group">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value="${scaledServings}"
                      onchange="scaleByServingsInput(this.value, ${recipe.servings})"
                      class="scaler-number-input"
                      aria-label="Rendimiento deseado"
                    />
                    <span style="font-size: 12px; color: var(--ink-inverse-muted);">${escapeHtml(recipe.yield_unit)}</span>
                  </div>
                </div>
                <div class="scaler-presets no-print">
                  ${[0.5, 1, 1.5, 2, 3]
                    .map(
                      (factor) => `
                    <button
                      type="button"
                      onclick="setScaleFactor(${factor})"
                      class="preset-btn ${Math.abs(currentScaleFactor - factor) < 0.01 ? "is-active" : ""}"
                    >${factor}x</button>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : `
              <div class="scaler-controls">
                <div>
                  <span style="font-size: 11px; color: var(--ink-inverse-muted);">Peso base (100% referencia)</span>
                  <div class="scaler-input-group">
                    <input
                      type="number"
                      step="10"
                      min="10"
                      value="${scaledBaseWeight}"
                      onchange="scaleByBaseWeightInput(this.value, ${baseWeight100})"
                      class="scaler-number-input"
                      aria-label="Peso base en gramos"
                    />
                    <span class="font-mono" style="font-size: 12px; color: var(--ink-inverse-muted);">g</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="display: block; font-size: 11px; color: var(--ink-inverse-muted);">Factor</span>
                  <span class="font-mono" style="font-size: 14px; font-weight: 600;">${(currentScaleFactor * 100).toFixed(0)}% (${currentScaleFactor.toFixed(2)}x)</span>
                </div>
              </div>
            `
            }
          </section>

          <!-- Lista de Ingredientes -->
          <section class="section-block">
            <div class="section-heading-row">
              <h2 class="section-heading">Ingredientes</h2>
              <span class="section-sub-hint no-print">Pulsa para marcar</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 18px;">
              ${Object.entries(ingredientGroups)
                .map(
                  ([groupName, items]) => `
                <div>
                  ${
                    Object.keys(ingredientGroups).length > 1 || groupName !== "Principal"
                      ? `<h3 class="ingredient-group-title">${escapeHtml(groupName)}</h3>`
                      : ""
                  }
                  <ul class="ingredient-list">
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
                          <li onclick="toggleIngredientCheck(${ing._idx})" class="ingredient-row ${isChecked ? "is-checked" : ""}">
                            <div class="ingredient-left">
                              <input type="checkbox" ${isChecked ? "checked" : ""} tabindex="-1" aria-hidden="true" />
                              <div>
                                <span class="ingredient-name">${escapeHtml(ing.name)}</span>
                                ${ing.is_base_weight ? `<span class="base-weight-tag">100%</span>` : ""}
                                ${ing.notes ? `<div class="ingredient-note">${escapeHtml(ing.notes)}</div>` : ""}
                              </div>
                            </div>
                            <div class="ingredient-qty">
                              <div>${scaledAmt} ${escapeHtml(ing.unit || "")}</div>
                              ${
                                currentViewScalingMode === "bakers_pct" && pct !== null
                                  ? `<div class="ingredient-pct">${pct}%</div>`
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
          </section>

          <!-- Control Térmico -->
          ${
            recipe.temperatures && recipe.temperatures.length > 0
              ? `
            <section class="section-block">
              <div class="section-heading-row">
                <h2 class="section-heading">Control Térmico</h2>
              </div>
              <div class="temp-list">
                ${recipe.temperatures
                  .map(
                    (tp) => `
                  <div class="temp-row">
                    <div>
                      <div style="font-size: 13px; font-weight: 600; color: var(--ink-primary);">${escapeHtml(tp.stage)}</div>
                      ${tp.notes ? `<div style="font-size: 12px; color: var(--ink-tertiary);">${escapeHtml(tp.notes)}</div>` : ""}
                    </div>
                    <span class="temp-badge">${tp.temp_c} °C</span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </section>
          `
              : ""
          }
        </div>

        <!-- Columna Derecha: Procedimiento, Notas e Iteraciones I+D -->
        <div style="display: flex; flex-direction: column; gap: 32px;">

          <!-- Procedimiento -->
          <section class="section-block">
            <div class="section-heading-row">
              <h2 class="section-heading">Procedimiento</h2>
              <span class="section-sub-hint">${(recipe.steps || []).length} pasos</span>
            </div>

            <div class="steps-list">
              ${(recipe.steps || [])
                .map((step, idx) => {
                  const isDone = checkedSteps.has(idx);
                  return `
                    <div class="step-row ${isDone ? "is-done" : ""}">
                      <div class="step-header">
                        <button type="button" class="step-trigger" onclick="toggleStepCheck(${idx})">
                          <span class="step-index">${isDone ? ICONS.check : step.order || idx + 1}</span>
                          <span class="step-title">${escapeHtml(step.title || `Paso ${idx + 1}`)}</span>
                        </button>

                        <div class="step-badges">
                          ${
                            step.temp_c !== null && step.temp_c !== undefined && step.temp_c !== ""
                              ? `<span class="step-temp-pill">${step.temp_c} °C</span>`
                              : ""
                          }
                          ${
                            step.duration_minutes
                              ? `<button
                                  type="button"
                                  onclick="startKitchenTimer('${escapeHtml(step.title || `Paso ${idx + 1}`)}', ${step.duration_minutes})"
                                  class="step-timer-btn no-print"
                                  title="Iniciar temporizador para este paso"
                                >
                                  ${ICONS.clock}
                                  <span>${step.duration_minutes} min</span>
                                </button>`
                              : ""
                          }
                        </div>
                      </div>

                      <p class="step-instruction">${escapeHtml(step.instruction)}</p>

                      ${
                        step.critical_point
                          ? `
                        <div class="step-pcc">
                          <span class="step-pcc-label">PCC</span>
                          <span>${escapeHtml(step.critical_point)}</span>
                        </div>
                      `
                          : ""
                      }

                      ${
                        step.photo
                          ? `<img src="${escapeHtml(step.photo)}" alt="Paso ${idx + 1}" class="step-photo" />`
                          : ""
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>
          </section>

          <!-- Emplatado y Conservación -->
          ${
            recipe.plating_notes || recipe.chef_notes
              ? `
            <section class="notes-grid">
              ${
                recipe.plating_notes
                  ? `
                <div>
                  <h3 class="note-block-title">Emplatado y Pase</h3>
                  <p class="note-block-body">${escapeHtml(recipe.plating_notes)}</p>
                </div>
              `
                  : ""
              }
              ${
                recipe.chef_notes
                  ? `
                <div>
                  <h3 class="note-block-title">Notas Técnicas y Conservación</h3>
                  <p class="note-block-body">${escapeHtml(recipe.chef_notes)}</p>
                </div>
              `
                  : ""
              }
            </section>
          `
              : ""
          }

          <!-- Cuaderno de Iteraciones I+D -->
          <section class="section-block" style="padding-top: 20px; border-top: 1px solid var(--hairline);">
            <div class="section-heading-row" style="border-bottom: none; padding-bottom: 0;">
              <h2 class="section-heading">Cuaderno I+D</h2>
              <button type="button" onclick="toggleQuickIterationForm()" class="btn btn-secondary btn-sm no-print">
                ${ICONS.plus} <span>Anotar prueba</span>
              </button>
            </div>

            <div id="quick-iteration-form" class="quick-form-panel is-hidden">
              <div class="filters-grid-2">
                <div>
                  <label for="quick-it-version" class="field-label">Versión</label>
                  <input id="quick-it-version" type="text" value="v1.${(recipe.iterations || []).length + 1}" class="control-input font-mono" />
                </div>
                <div>
                  <label for="quick-it-date" class="field-label">Fecha</label>
                  <input id="quick-it-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="control-input font-mono" />
                </div>
              </div>
              <div>
                <label for="quick-it-changes" class="field-label">Ajustes probados y resultado sensorial</label>
                <textarea id="quick-it-changes" rows="2" placeholder="Ej. Subida de horno a 255 °C, mejor greñado..." class="control-textarea"></textarea>
              </div>
              <div>
                <label for="quick-it-next" class="field-label">Hipótesis para la siguiente prueba</label>
                <input id="quick-it-next" type="text" placeholder="Ej. Reducir sal un 0.2%..." class="control-input" />
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" onclick="toggleQuickIterationForm()" class="btn btn-ghost btn-sm">Cancelar</button>
                <button type="button" onclick="saveQuickIteration('${escapeHtml(recipe.id)}')" class="btn btn-accent btn-sm">Guardar nota</button>
              </div>
            </div>

            ${
              !recipe.iterations || recipe.iterations.length === 0
                ? `<p style="font-size: 13px; color: var(--ink-tertiary);">Sin iteraciones registradas todavía.</p>`
                : `
              <div>
                ${recipe.iterations
                  .map(
                    (it) => `
                  <div class="iteration-item">
                    <div class="iteration-head">
                      <span class="meta-pill">${escapeHtml(it.version)}</span>
                      <span class="font-mono" style="font-size: 11px; color: var(--ink-tertiary);">${escapeHtml(it.date)}</span>
                    </div>
                    <p style="font-size: 13px; color: var(--ink-primary);">${escapeHtml(it.changes)}</p>
                    ${it.next_steps ? `<p class="iteration-next">Siguiente ajuste: ${escapeHtml(it.next_steps)}</p>` : ""}
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
            }
          </section>
        </div>
      </div>

      <!-- Equipamiento y Sub-recetas (Sección Inferior Limpia con Hairlines) -->
      <section class="section-block" style="padding-top: 24px; border-top: 1px solid var(--hairline);">
        <div class="section-heading-row">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h2 class="section-heading">Equipamiento</h2>
            <span class="meta-pill ${eqStatus.canCookMandatory ? "meta-pill-ok" : "meta-pill-alert"}">
              ${
                eqStatus.canCookMandatory
                  ? "Equipo obligatorio disponible"
                  : `Falta ${eqStatus.missingMandatory.length} obligatorio`
              }
            </span>
          </div>
          <button type="button" onclick="openUtensilsModal()" class="btn btn-ghost btn-sm no-print">
            <span>Gestionar inventario</span> ${ICONS.arrowRight}
          </button>
        </div>

        <div class="equipment-grid">
          <div>
            <div class="equipment-col-title">Obligatorios (${mandatoryUtensils.length})</div>
            ${
              mandatoryUtensils.length === 0
                ? `<p style="font-size: 12.5px; color: var(--ink-tertiary);">Ningún utensilio especial obligatorio.</p>`
                : mandatoryUtensils
                    .map((u) => {
                      const catItem = uMap[u.utensil_id];
                      const isOwned = catItem ? catItem.owned : true;
                      return `
                        <div class="equipment-row">
                          <div>
                            <div style="font-size: 13.5px; font-weight: 600; color: var(--ink-primary);">${escapeHtml(u.name)}</div>
                            ${u.notes ? `<div style="font-size: 12px; color: var(--ink-tertiary);">${escapeHtml(u.notes)}</div>` : ""}
                          </div>
                          <button
                            type="button"
                            onclick="quickToggleUtensilOwned('${escapeHtml(u.utensil_id)}')"
                            class="meta-pill no-print ${isOwned ? "meta-pill-ok" : "meta-pill-alert"}"
                            style="cursor: pointer;"
                            title="Cambiar disponibilidad en tu cocina"
                          >
                            ${isOwned ? "Disponible" : "Falta"}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>

          <div>
            <div class="equipment-col-title">Opcionales / Sustituibles (${optionalUtensils.length})</div>
            ${
              optionalUtensils.length === 0
                ? `<p style="font-size: 12.5px; color: var(--ink-tertiary);">Sin utensilios opcionales registrados.</p>`
                : optionalUtensils
                    .map((u) => {
                      const catItem = uMap[u.utensil_id];
                      const isOwned = catItem ? catItem.owned : true;
                      return `
                        <div class="equipment-row">
                          <div>
                            <div style="font-size: 13.5px; font-weight: 500; color: var(--ink-primary);">${escapeHtml(u.name)}</div>
                            ${u.notes ? `<div style="font-size: 12px; color: var(--ink-tertiary);">Alternativa: ${escapeHtml(u.notes)}</div>` : ""}
                          </div>
                          <button
                            type="button"
                            onclick="quickToggleUtensilOwned('${escapeHtml(u.utensil_id)}')"
                            class="meta-pill no-print"
                            style="cursor: pointer;"
                            title="Cambiar disponibilidad en tu cocina"
                          >
                            ${isOwned ? "Disponible" : "Usar alt."}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>
        </div>

        ${
          (recipe.subrecipes && recipe.subrecipes.length > 0) || usedInRecipes.length > 0
            ? `
          <div class="subrecipes-strip">
            ${
              recipe.subrecipes && recipe.subrecipes.length > 0
                ? `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div class="equipment-col-title">Sub-recetas requeridas</div>
                ${recipe.subrecipes
                  .map((sr) => {
                    const scaledAmt =
                      sr.amount !== null && sr.amount !== undefined
                        ? formatNumber(sr.amount * currentScaleFactor)
                        : "";
                    const targetExists = allRecipes.some((r) => r.id === sr.recipe_id);
                    return `
                      <div class="subrecipe-row">
                        <div>
                          <div style="font-size: 13px; font-weight: 600;">${escapeHtml(sr.name)}</div>
                          <div class="font-mono" style="font-size: 11.5px; color: var(--ink-tertiary);">
                            ${scaledAmt} ${escapeHtml(sr.unit || "")}${sr.notes ? ` · ${escapeHtml(sr.notes)}` : ""}
                          </div>
                        </div>
                        ${
                          targetExists
                            ? `<button type="button" onclick="selectRecipe('${escapeHtml(sr.recipe_id)}')" class="btn btn-secondary btn-sm">
                                <span>Abrir</span> ${ICONS.arrowRight}
                              </button>`
                            : `<span class="font-mono" style="font-size: 11px; color: var(--ink-muted);">${escapeHtml(sr.recipe_id)}</span>`
                        }
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
                : ""
            }

            ${
              usedInRecipes.length > 0
                ? `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div class="equipment-col-title">Utilizada como base en</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                  ${usedInRecipes
                    .map(
                      (parent) => `
                    <button type="button" onclick="selectRecipe('${escapeHtml(parent.id)}')" class="btn btn-secondary btn-sm">
                      <span>${escapeHtml(parent.title)}</span> ${ICONS.arrowRight}
                    </button>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : ""
            }
          </div>
        `
            : ""
        }
      </section>
    </article>
  `;

  // Re-hydrate wine card immediately if cached
  if (wineSuggestionCache.has(recipe.id)) {
    renderWineSuggestionSlot(
      document.getElementById("vinum-pairing-slot"),
      wineSuggestionCache.get(recipe.id)
    );
  }
}

// ============================================================================
// Scaling, Checkboxes & Quick Iterations
// ============================================================================
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
  if (el) el.classList.toggle("is-hidden");
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

// ============================================================================
// Kitchen Timers & Kitchen Mode
// ============================================================================
function startKitchenTimer(label, minutes) {
  const totalSeconds = Math.round((Number(minutes) || 1) * 60);
  activeTimers.push({
    id: "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    label,
    remainingSeconds: totalSeconds,
    totalSeconds,
    paused: false,
  });
  ensureTimerInterval();
  renderTimersDock();
}

function ensureTimerInterval() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    for (const t of activeTimers) {
      if (!t.paused && t.remainingSeconds > 0) {
        t.remainingSeconds -= 1;
        if (t.remainingSeconds === 0) playTimerBeep();
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
  } catch {
    // Ignore audio context restrictions
  }
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
        <div class="timer-card ${isFinished ? "is-finished" : ""}">
          <div>
            <div class="timer-label">${escapeHtml(t.label)}</div>
            <div class="timer-clock">${timeStr}${isFinished ? " · Listo" : ""}</div>
          </div>
          <div class="timer-actions">
            ${
              !isFinished
                ? `<button type="button" onclick="togglePauseTimer('${t.id}')" class="timer-btn" aria-label="${t.paused ? "Reanudar" : "Pausar"}">
                    ${t.paused ? ICONS.play : ICONS.pause}
                  </button>`
                : ""
            }
            <button type="button" onclick="removeTimer('${t.id}')" class="timer-btn" aria-label="Cerrar temporizador">
              ${ICONS.close}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function toggleKitchenMode() {
  document.body.classList.toggle("kitchen-mode");
  const isActive = document.body.classList.contains("kitchen-mode");
  const btn = document.getElementById("btn-kitchen-mode");
  if (btn) {
    btn.classList.toggle("btn-kitchen-active", isActive);
    btn.classList.toggle("btn-ghost", !isActive);
  }
  try {
    if (isActive && "wakeLock" in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
    } else if (!isActive && wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    // Wake Lock optional
  }
}

// ============================================================================
// Full Recipe Editor (Create / Edit)
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

  editingDraft.techniques = val("ed-techniques").split(",").map((s) => s.trim()).filter(Boolean);
  editingDraft.tags = val("ed-tags").split(",").map((s) => s.trim()).filter(Boolean);

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
    <div class="editor-shell">
      <div class="sheet-toolbar">
        <div>
          <h1 class="sheet-title" style="font-size: 26px;">
            ${editingOriginalId ? `Editar: ${escapeHtml(d.title)}` : "Nueva Ficha Técnica"}
          </h1>
          <p style="font-size: 12.5px; color: var(--ink-tertiary); margin-top: 2px;">
            Persistido en PostgreSQL (<code class="font-mono">culinary.recipes</code>) con exportación Markdown/YAML.
          </p>
        </div>
        <div class="sheet-actions">
          <button type="button" onclick="cancelRecipeEditor()" class="btn btn-secondary">Cancelar</button>
          <button type="button" onclick="saveRecipeFromEditor()" class="btn btn-accent">Guardar receta</button>
        </div>
      </div>

      <!-- Identificación -->
      <section class="editor-section">
        <h2 class="section-heading">Identificación y Rendimiento</h2>
        <div class="editor-grid-12">
          <div class="col-8">
            <label for="ed-title" class="field-label">Nombre del plato o elaboración *</label>
            <input id="ed-title" type="text" value="${escapeHtml(d.title)}" placeholder="Ej. Arroz Meloso de Pato y Perrechicos" class="control-input" />
          </div>
          <div class="col-4">
            <label for="ed-category" class="field-label">Categoría</label>
            <input id="ed-category" list="category-suggestions" value="${escapeHtml(d.category)}" class="control-input" />
            <datalist id="category-suggestions">
              <option value="Entrantes y Cuchara"></option>
              <option value="Ensaladas y Huerta"></option>
              <option value="Tapas y Pintxos"></option>
              <option value="Pescados y Mariscos"></option>
              <option value="Arroces"></option>
              <option value="Carnes y Caza"></option>
              <option value="Postres y Dulces"></option>
              <option value="Platos Vegetarianos y Setas"></option>
              <option value="Panadería / Masa"></option>
              <option value="Fondo / Base"></option>
            </datalist>
          </div>
          <div class="col-8">
            <label for="ed-subtitle" class="field-label">Subtítulo gastronómico</label>
            <input id="ed-subtitle" type="text" value="${escapeHtml(d.subtitle)}" placeholder="Breve descripción técnica..." class="control-input" />
          </div>
          <div class="col-4" style="display: flex; align-items: end;">
            <label class="cookable-toggle" style="width: 100%; height: 34px;">
              <span>Es sub-receta / base</span>
              <input id="ed-is-subrecipe" type="checkbox" ${d.is_subrecipe ? "checked" : ""} />
            </label>
          </div>
        </div>

        <div class="editor-grid-12">
          <div class="col-2">
            <label for="ed-servings" class="field-label">Rendimiento</label>
            <input id="ed-servings" type="number" step="any" value="${d.servings}" class="control-input font-mono" />
          </div>
          <div class="col-3">
            <label for="ed-yield-unit" class="field-label">Unidad</label>
            <input id="ed-yield-unit" type="text" value="${escapeHtml(d.yield_unit)}" placeholder="raciones, g, ml" class="control-input" />
          </div>
          <div class="col-3">
            <label for="ed-scaling-mode" class="field-label">Modo escalado</label>
            <select id="ed-scaling-mode" class="control-select">
              <option value="servings" ${d.scaling_mode === "servings" ? "selected" : ""}>Por raciones</option>
              <option value="bakers_pct" ${d.scaling_mode === "bakers_pct" ? "selected" : ""}>% Panadero</option>
            </select>
          </div>
          <div class="col-2">
            <label for="ed-difficulty" class="field-label">Dificultad (1–5)</label>
            <input id="ed-difficulty" type="number" min="1" max="5" value="${d.difficulty}" class="control-input font-mono" />
          </div>
          <div class="col-2">
            <label for="ed-rating" class="field-label">Nota (0–5)</label>
            <input id="ed-rating" type="number" step="0.1" min="0" max="5" value="${d.rating}" class="control-input font-mono" />
          </div>
        </div>

        <div class="editor-grid-12">
          <div class="col-4">
            <label for="ed-techniques" class="field-label">Técnicas (separadas por coma)</label>
            <input id="ed-techniques" type="text" value="${escapeHtml((d.techniques || []).join(", "))}" placeholder="Sous-vide, Maillard..." class="control-input" />
          </div>
          <div class="col-4">
            <label for="ed-tags" class="field-label">Etiquetas (impulsan el maridaje)</label>
            <input id="ed-tags" type="text" value="${escapeHtml((d.tags || []).join(", "))}" placeholder="carrillera, setas, otoño..." class="control-input" />
          </div>
          <div class="col-4">
            <label for="ed-cover-photo" class="field-label">Foto principal</label>
            <div style="display: flex; gap: 6px;">
              <input id="ed-cover-photo" type="text" value="${escapeHtml(d.cover_photo || "")}" placeholder="/media/foto.jpg" class="control-input font-mono" />
              <label class="btn btn-secondary btn-sm" style="cursor: pointer; height: 33px;">
                ${ICONS.upload} <span>Subir</span>
                <input type="file" accept="image/*" class="is-hidden" onchange="uploadCoverPhoto(this)" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Utensilios -->
      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Utensilios y Equipamiento</h2>
          <div class="sheet-actions">
            <select id="ed-add-utensil-select" class="control-select" style="width: auto;">
              <option value="">Seleccionar de catálogo...</option>
              ${utensilsCatalog.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} (${escapeHtml(u.category)})</option>`).join("")}
            </select>
            <button type="button" onclick="editorAddUtensilFromCatalog()" class="btn btn-secondary btn-sm">Añadir</button>
            <button type="button" onclick="editorAddCustomUtensil()" class="btn btn-ghost btn-sm">Nuevo libre</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(d.utensils || [])
            .map(
              (u, idx) => `
            <div class="editor-row-box editor-grid-12" style="align-items: center;">
              <div class="col-4">
                <input type="text" value="${escapeHtml(u.name)}" oninput="editingDraft.utensils[${idx}].name = this.value" placeholder="Utensilio" class="control-input" />
              </div>
              <div class="col-3">
                <select onchange="editingDraft.utensils[${idx}].mandatory = (this.value === 'true'); syncDraftScalarsFromDOM(); renderRecipeEditor();" class="control-select font-mono">
                  <option value="true" ${u.mandatory ? "selected" : ""}>Obligatorio</option>
                  <option value="false" ${!u.mandatory ? "selected" : ""}>Opcional</option>
                </select>
              </div>
              <div class="col-4">
                <input type="text" value="${escapeHtml(u.notes || "")}" oninput="editingDraft.utensils[${idx}].notes = this.value" placeholder="Uso técnico o sustituto" class="control-input" />
              </div>
              <div class="col-1" style="text-align: right;">
                <button type="button" onclick="editingDraft.utensils.splice(${idx}, 1); syncDraftScalarsFromDOM(); renderRecipeEditor();" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <!-- Tiempos y Temperaturas -->
      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Tiempos y Temperaturas</h2>
          <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.temperatures.push({stage:'', temp_c: 100, notes:''}); renderRecipeEditor();" class="btn btn-secondary btn-sm">
            ${ICONS.plus} <span>Punto térmico</span>
          </button>
        </div>

        <div class="editor-grid-12">
          <div class="col-3">
            <label for="ed-prep-min" class="field-label">Prep (min)</label>
            <input id="ed-prep-min" type="number" min="0" value="${d.timings?.prep_minutes || 0}" class="control-input font-mono" />
          </div>
          <div class="col-3">
            <label for="ed-cook-min" class="field-label">Cocción (min)</label>
            <input id="ed-cook-min" type="number" min="0" value="${d.timings?.cook_minutes || 0}" class="control-input font-mono" />
          </div>
          <div class="col-3">
            <label for="ed-rest-min" class="field-label">Reposo (min)</label>
            <input id="ed-rest-min" type="number" min="0" value="${d.timings?.rest_minutes || 0}" class="control-input font-mono" />
          </div>
          <div class="col-3">
            <label for="ed-rest-notes" class="field-label">Detalle reposo</label>
            <input id="ed-rest-notes" type="text" value="${escapeHtml(d.timings?.rest_notes || "")}" placeholder="16h a 4 °C" class="control-input" />
          </div>
        </div>

        ${(d.temperatures || [])
          .map(
            (tp, idx) => `
          <div class="editor-grid-12" style="align-items: center;">
            <div class="col-5">
              <input type="text" value="${escapeHtml(tp.stage)}" oninput="editingDraft.temperatures[${idx}].stage = this.value" placeholder="Fase (ej. Sonda al corazón)" class="control-input" />
            </div>
            <div class="col-2">
              <input type="number" step="0.5" value="${tp.temp_c}" oninput="editingDraft.temperatures[${idx}].temp_c = parseFloat(this.value) || 0" class="control-input font-mono" />
            </div>
            <div class="col-4">
              <input type="text" value="${escapeHtml(tp.notes || "")}" oninput="editingDraft.temperatures[${idx}].notes = this.value" placeholder="Notas térmicas" class="control-input" />
            </div>
            <div class="col-1" style="text-align: right;">
              <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.temperatures.splice(${idx}, 1); renderRecipeEditor();" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
            </div>
          </div>
        `
          )
          .join("")}
      </section>

      <!-- Ingredientes y Sub-recetas -->
      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Escandallo de Ingredientes</h2>
          <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.ingredients.push({name:'', amount:100, unit:'g', group:'Principal', is_base_weight:false, notes:''}); renderRecipeEditor();" class="btn btn-secondary btn-sm">
            ${ICONS.plus} <span>Ingrediente</span>
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(d.ingredients || [])
            .map(
              (ing, idx) => `
            <div class="editor-row-box editor-grid-12" style="align-items: center;">
              <div class="col-3">
                <input type="text" value="${escapeHtml(ing.name)}" oninput="editingDraft.ingredients[${idx}].name = this.value" placeholder="Ingrediente" class="control-input" />
              </div>
              <div class="col-2" style="display: flex; gap: 4px;">
                <input type="number" step="any" value="${ing.amount ?? ""}" oninput="editingDraft.ingredients[${idx}].amount = this.value === '' ? null : parseFloat(this.value)" placeholder="Cant." class="control-input font-mono" />
                <input type="text" value="${escapeHtml(ing.unit || "g")}" oninput="editingDraft.ingredients[${idx}].unit = this.value" placeholder="g" class="control-input font-mono" style="width: 56px;" />
              </div>
              <div class="col-2">
                <input type="text" value="${escapeHtml(ing.group || "Principal")}" oninput="editingDraft.ingredients[${idx}].group = this.value" placeholder="Grupo" class="control-input" />
              </div>
              <div class="col-3">
                <input type="text" value="${escapeHtml(ing.notes || "")}" oninput="editingDraft.ingredients[${idx}].notes = this.value" placeholder="Corte / nota" class="control-input" />
              </div>
              <div class="col-2" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <label class="font-mono" style="font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;" title="Base 100%">
                  <input type="checkbox" ${ing.is_base_weight ? "checked" : ""} onchange="editingDraft.ingredients[${idx}].is_base_weight = this.checked" style="accent-color: var(--flame-blue);" />
                  <span>100%</span>
                </label>
                <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.ingredients.splice(${idx}, 1); renderRecipeEditor();" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="sheet-toolbar" style="padding-top: 10px;">
          <span class="equipment-col-title" style="margin: 0;">Sub-recetas vinculadas</span>
          <div class="sheet-actions">
            <select id="ed-add-subrecipe-select" class="control-select" style="width: auto;">
              <option value="">Seleccionar receta...</option>
              ${otherRecipes.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)}</option>`).join("")}
            </select>
            <button type="button" onclick="editorAddSubrecipe()" class="btn btn-secondary btn-sm">Vincular</button>
          </div>
        </div>

        ${(d.subrecipes || [])
          .map(
            (sr, idx) => `
          <div class="editor-row-box editor-grid-12" style="align-items: center;">
            <div class="col-4" style="font-size: 13px; font-weight: 600;">${escapeHtml(sr.name)}</div>
            <div class="col-3" style="display: flex; gap: 4px;">
              <input type="number" step="any" value="${sr.amount ?? ""}" oninput="editingDraft.subrecipes[${idx}].amount = this.value === '' ? null : parseFloat(this.value)" placeholder="Cant." class="control-input font-mono" />
              <input type="text" value="${escapeHtml(sr.unit || "ml")}" oninput="editingDraft.subrecipes[${idx}].unit = this.value" class="control-input font-mono" style="width: 60px;" />
            </div>
            <div class="col-4">
              <input type="text" value="${escapeHtml(sr.notes || "")}" oninput="editingDraft.subrecipes[${idx}].notes = this.value" placeholder="Aplicación" class="control-input" />
            </div>
            <div class="col-1" style="text-align: right;">
              <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.subrecipes.splice(${idx}, 1); renderRecipeEditor();" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
            </div>
          </div>
        `
          )
          .join("")}
      </section>

      <!-- Pasos -->
      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Procedimiento</h2>
          <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.steps.push({order: editingDraft.steps.length + 1, title:'', instruction:'', duration_minutes:null, temp_c:null, critical_point:'', photo:''}); renderRecipeEditor();" class="btn btn-secondary btn-sm">
            ${ICONS.plus} <span>Añadir paso</span>
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${(d.steps || [])
            .map(
              (st, idx) => `
            <div class="editor-row-box" style="display: flex; flex-direction: column; gap: 8px;">
              <div class="editor-grid-12" style="align-items: center;">
                <div class="col-1 font-mono" style="font-size: 12px; color: var(--ink-tertiary);">#${idx + 1}</div>
                <div class="col-5">
                  <input type="text" value="${escapeHtml(st.title || "")}" oninput="editingDraft.steps[${idx}].title = this.value" placeholder="Título del paso" class="control-input" />
                </div>
                <div class="col-2">
                  <input type="number" min="0" value="${st.duration_minutes ?? ""}" oninput="editingDraft.steps[${idx}].duration_minutes = this.value === '' ? null : parseInt(this.value, 10)" placeholder="Min" class="control-input font-mono" />
                </div>
                <div class="col-2">
                  <input type="number" step="0.5" value="${st.temp_c ?? ""}" oninput="editingDraft.steps[${idx}].temp_c = this.value === '' ? null : parseFloat(this.value)" placeholder="°C" class="control-input font-mono" />
                </div>
                <div class="col-2" style="text-align: right;">
                  <button type="button" onclick="syncDraftScalarsFromDOM(); editingDraft.steps.splice(${idx}, 1); renderRecipeEditor();" class="btn btn-danger-ghost btn-sm">Eliminar</button>
                </div>
              </div>
              <textarea rows="2" oninput="editingDraft.steps[${idx}].instruction = this.value" placeholder="Instrucción técnica..." class="control-textarea">${escapeHtml(st.instruction || "")}</textarea>
              <div class="editor-grid-12">
                <div class="col-8">
                  <input type="text" value="${escapeHtml(st.critical_point || "")}" oninput="editingDraft.steps[${idx}].critical_point = this.value" placeholder="Punto Crítico de Control (PCC)" class="control-input" />
                </div>
                <div class="col-4" style="display: flex; gap: 6px;">
                  <input type="text" value="${escapeHtml(st.photo || "")}" oninput="editingDraft.steps[${idx}].photo = this.value" placeholder="URL foto" class="control-input font-mono" />
                  <label class="btn btn-secondary btn-sm" style="cursor: pointer; height: 33px;">
                    ${ICONS.upload}
                    <input type="file" accept="image/*" class="is-hidden" onchange="uploadStepPhoto(this, ${idx})" />
                  </label>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <!-- Notas -->
      <section class="editor-section">
        <div class="notes-grid" style="border-top: none; padding-top: 0;">
          <div>
            <label for="ed-plating-notes" class="field-label">Emplatado, acabado y pase</label>
            <textarea id="ed-plating-notes" rows="3" class="control-textarea">${escapeHtml(d.plating_notes || "")}</textarea>
          </div>
          <div>
            <label for="ed-chef-notes" class="field-label">Notas técnicas y conservación</label>
            <textarea id="ed-chef-notes" rows="3" class="control-textarea">${escapeHtml(d.chef_notes || "")}</textarea>
          </div>
        </div>
      </section>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 12px; border-top: 1px solid var(--hairline);">
        <button type="button" onclick="cancelRecipeEditor()" class="btn btn-secondary">Cancelar</button>
        <button type="button" onclick="saveRecipeFromEditor()" class="btn btn-accent">Guardar receta</button>
      </div>
    </div>
  `;
}

function editorAddUtensilFromCatalog() {
  syncDraftScalarsFromDOM();
  const uId = document.getElementById("ed-add-utensil-select")?.value;
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
  const rId = document.getElementById("ed-add-subrecipe-select")?.value;
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

  editingDraft.ingredients = (editingDraft.ingredients || []).filter((i) => i.name && i.name.trim());
  editingDraft.steps = (editingDraft.steps || []).filter(
    (s) => (s.instruction && s.instruction.trim()) || (s.title && s.title.trim())
  );
  editingDraft.temperatures = (editingDraft.temperatures || []).filter((t) => t.stage && t.stage.trim());
  editingDraft.utensils = (editingDraft.utensils || []).filter((u) => u.name && u.name.trim());

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
    wineSuggestionCache.delete(saved.id);
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
  if (!confirm(`¿Seguro que quieres eliminar "${r.title}"?`)) return;
  const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, { method: "DELETE" });
  if (res.ok) {
    wineSuggestionCache.delete(recipeId);
    activeRecipeId = null;
    window.history.replaceState(null, "", "/");
    await loadInitialData();
  }
}

// ============================================================================
// Utensils Catalog Modal
// ============================================================================
function openUtensilsModal() {
  const modal = document.getElementById("utensils-modal");
  if (!modal) return;
  modal.classList.remove("is-hidden");
  renderUtensilsCatalogModal();
}

function closeUtensilsModal() {
  document.getElementById("utensils-modal")?.classList.add("is-hidden");
}

function renderUtensilsCatalogModal() {
  const container = document.getElementById("utensils-catalog-list");
  if (!container) return;

  const byCat = {};
  for (const u of utensilsCatalog) {
    const cat = u.category || "General";
    byCat[cat] = byCat[cat] || [];
    byCat[cat].push(u);
  }

  container.innerHTML = Object.entries(byCat)
    .map(
      ([cat, items]) => `
      <div>
        <h3 class="ingredient-group-title">${escapeHtml(cat)} (${items.length})</h3>
        <div class="equipment-grid" style="gap: 8px 20px;">
          ${items
            .map(
              (u) => `
            <div class="equipment-row" style="opacity: ${u.owned ? "1" : "0.58"};">
              <label style="display: flex; align-items: flex-start; gap: 9px; cursor: pointer; flex: 1;">
                <input
                  type="checkbox"
                  ${u.owned ? "checked" : ""}
                  onchange="toggleCatalogUtensilOwned('${escapeHtml(u.id)}', this.checked)"
                  style="margin-top: 3px; width: 15px; height: 15px; accent-color: var(--flame-blue);"
                />
                <div>
                  <div style="font-size: 13px; font-weight: 600;">${escapeHtml(u.name)}</div>
                  ${u.specs ? `<div style="font-size: 11.5px; color: var(--ink-tertiary);">${escapeHtml(u.specs)}</div>` : ""}
                </div>
              </label>
              <button
                type="button"
                onclick="deleteCatalogUtensil('${escapeHtml(u.id)}')"
                class="btn btn-danger-ghost btn-sm"
                aria-label="Eliminar utensilio"
              >${ICONS.trash}</button>
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
// Raw Markdown + YAML Modal
// ============================================================================
let currentMdRecipeId = null;

async function openMarkdownModal(recipeId) {
  currentMdRecipeId = recipeId;
  const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/markdown`);
  if (!res.ok) return;
  const text = await res.text();
  document.getElementById("md-modal-filename").textContent = `${recipeId}.md`;
  document.getElementById("raw-markdown-textarea").value = text;
  document.getElementById("markdown-modal").classList.remove("is-hidden");
}

function closeMarkdownModal() {
  document.getElementById("markdown-modal")?.classList.add("is-hidden");
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
    wineSuggestionCache.delete(updated.id);
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

async function copyRawMarkdown() {
  const content = document.getElementById("raw-markdown-textarea").value;
  await navigator.clipboard.writeText(content);
  const btn = document.getElementById("btn-copy-md");
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = "Copiado";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1400);
  }
}

// ============================================================================
// Empty / Error States & Format Helpers
// ============================================================================
function renderEmptyState() {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div style="color: var(--ink-tertiary);">${ICONS.book}</div>
      <h2 class="section-heading">Tu recetario técnico está listo</h2>
      <p style="font-size: 13.5px; max-width: 44ch;">
        Selecciona una elaboración en el índice izquierdo o crea una nueva ficha técnica con escandallo y maridaje.
      </p>
      <button type="button" onclick="openRecipeEditor(null)" class="btn btn-accent">
        ${ICONS.plus} <span>Crear primera receta</span>
      </button>
    </div>
  `;
}

function renderErrorState(message) {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <h2 class="section-heading" style="color: var(--thermal-red);">Error de conexión</h2>
      <p style="font-size: 13.5px; max-width: 46ch;">${escapeHtml(message)}</p>
      <button type="button" onclick="loadInitialData()" class="btn btn-secondary">Reintentar</button>
    </div>
  `;
}

function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return "";
  return (Math.round(Number(val) * 100) / 100).toString();
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
