// ============================================================================
// Mise en Place MD — Recipe List, Detail Sheet, Pairing & Modals Views
// ============================================================================

import * as api from "./api.js";
import { ICONS, RESOLUTION_SOURCE_ES, WINE_TYPE_ES } from "./constants.js";
import {
  checkRecipeEquipmentStatus,
  escapeHtml,
  filterAndSortRecipes,
  formatDuration,
  formatNumber,
  getBaseWeightTotal,
  getUtensilMap,
  sortCategoriesCanonical,
  state,
} from "./state.js";

export function updateUtensilHeaderCounter() {
  const ownedCount = state.utensilsCatalog.filter((u) => u.owned).length;
  const el = document.getElementById("header-utensil-count");
  if (el) {
    el.textContent = `${ownedCount}/${state.utensilsCatalog.length}`;
  }
}

export function populateFilterDropdowns() {
  const catSelect = document.getElementById("filter-category");
  const utSelect = document.getElementById("filter-utensil");
  const techSelect = document.getElementById("filter-technique");
  if (!catSelect || !utSelect || !techSelect) return;

  const currentCat = catSelect.value;
  const currentUt = utSelect.value;
  const currentTech = techSelect.value;

  const categories = sortCategoriesCanonical(
    Array.from(new Set(state.allRecipes.map((r) => r.category).filter(Boolean)))
  );
  catSelect.innerHTML =
    `<option value="">Todas</option>` +
    categories
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
  catSelect.value = currentCat;

  const sortedUtensils = [...state.utensilsCatalog].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  utSelect.innerHTML =
    `<option value="">Cualquiera</option>` +
    sortedUtensils
      .map(
        (u) =>
          `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}${
            u.owned ? "" : " (sin disp.)"
          }</option>`
      )
      .join("");
  utSelect.value = currentUt;

  const techniques = Array.from(
    new Set(state.allRecipes.flatMap((r) => r.techniques || []).filter(Boolean))
  ).sort();
  techSelect.innerHTML =
    `<option value="">Todas</option>` +
    techniques
      .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
      .join("");
  techSelect.value = currentTech;
}

export function applyFilters() {
  const q = (document.getElementById("filter-search")?.value || "").trim();
  const cookableToday =
    document.getElementById("filter-cookable-today")?.checked || false;
  const ingInclude = document.getElementById("filter-ing-include")?.value || "";
  const ingExclude = document.getElementById("filter-ing-exclude")?.value || "";
  const category = document.getElementById("filter-category")?.value || "";
  const subType = document.getElementById("filter-subrecipe")?.value || "all";
  const utensilId = document.getElementById("filter-utensil")?.value || "";
  const technique = document.getElementById("filter-technique")?.value || "";
  const sortBy = document.getElementById("sort-by")?.value || "updated_desc";

  state.hasActiveFilters = Boolean(
    q ||
      cookableToday ||
      ingInclude ||
      ingExclude ||
      category ||
      subType !== "all" ||
      utensilId ||
      technique
  );

  const clearBtn = document.getElementById("search-clear-btn");
  const kbdHint = document.getElementById("search-kbd-hint");
  if (clearBtn && kbdHint) {
    clearBtn.classList.toggle("is-hidden", !state.hasActiveFilters);
    kbdHint.classList.toggle("is-hidden", state.hasActiveFilters);
  }

  state.filteredRecipes = filterAndSortRecipes(
    state.allRecipes,
    {
      q,
      cookableToday,
      ingInclude,
      ingExclude,
      category,
      subType,
      utensilId,
      technique,
      sortBy,
    },
    state.utensilsCatalog
  );

  const countLabel = document.getElementById("recipe-count-label");
  if (countLabel) {
    countLabel.textContent =
      state.filteredRecipes.length === state.allRecipes.length
        ? `${state.allRecipes.length} recetas`
        : `${state.filteredRecipes.length} de ${state.allRecipes.length}`;
  }

  renderRecipeList();
}

export function resetAllFilters() {
  const ids = [
    ["filter-search", ""],
    ["filter-ing-include", ""],
    ["filter-ing-exclude", ""],
    ["filter-category", ""],
    ["filter-subrecipe", "all"],
    ["filter-utensil", ""],
    ["filter-technique", ""],
    ["sort-by", "updated_desc"],
  ];
  for (const [id, value] of ids) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  const cookableEl = document.getElementById("filter-cookable-today");
  if (cookableEl) cookableEl.checked = false;
  applyFilters();
}

export function handleCategoryToggle(detailsEl, categoryName) {
  if (state.hasActiveFilters) return;
  if (detailsEl.open) state.openCategories.add(categoryName);
  else state.openCategories.delete(categoryName);
}

export function renderRecipeList() {
  const container = document.getElementById("recipe-list-container");
  if (!container) return;

  if (state.filteredRecipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <p style="font-size: 13px; color: var(--ink-secondary);">Ninguna receta coincide con los filtros.</p>
        <button type="button" data-action="reset-filters" class="btn btn-secondary btn-sm">
          Restablecer filtros
        </button>
      </div>
    `;
    return;
  }

  const grouped = new Map();
  for (const r of state.filteredRecipes) {
    const cat = r.category || "Sin categoría";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(r);
  }

  const orderedCategories = sortCategoriesCanonical(Array.from(grouped.keys()));

  if (state.openCategories.size === 0 && orderedCategories.length > 0) {
    const activeRec = state.filteredRecipes.find((r) => r.id === state.activeRecipeId);
    state.openCategories.add(activeRec?.category || orderedCategories[0]);
  }

  container.innerHTML = orderedCategories
    .map((category) => {
      const items = grouped.get(category) || [];
      const isOpen = state.hasActiveFilters || state.openCategories.has(category);

      const rowsHtml = items
        .map((r) => {
          const isSelected = r.id === state.activeRecipeId;
          const eq = checkRecipeEquipmentStatus(r);
          const activeTime =
            (r.timings?.prep_minutes || 0) + (r.timings?.cook_minutes || 0);

          return `
            <button
              type="button"
              data-action="select-recipe"
              data-recipe-id="${escapeHtml(r.id)}"
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
        <details class="category-group" data-category="${escapeHtml(category)}" ${isOpen ? "open" : ""}>
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

export function renderWineSuggestionSlot(slot, data) {
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

export function renderRecipeDetail(recipe) {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;

  const uMap = getUtensilMap();
  const eqStatus = checkRecipeEquipmentStatus(recipe);
  const mandatoryUtensils = (recipe.utensils || []).filter((u) => u.mandatory);
  const optionalUtensils = (recipe.utensils || []).filter((u) => !u.mandatory);

  const baseWeight100 = getBaseWeightTotal(recipe);
  const scaledBaseWeight =
    Math.round(baseWeight100 * state.currentScaleFactor * 10) / 10;
  const scaledServings =
    Math.round(recipe.servings * state.currentScaleFactor * 100) / 100;

  const usedInRecipes = state.allRecipes.filter((other) =>
    (other.subrecipes || []).some((sr) => sr.recipe_id === recipe.id)
  );

  const ingredientGroups = {};
  for (let idx = 0; idx < (recipe.ingredients || []).length; idx++) {
    const ing = recipe.ingredients[idx];
    const gName = ing.group || "Principal";
    if (!ingredientGroups[gName]) ingredientGroups[gName] = [];
    ingredientGroups[gName].push({ ...ing, _idx: idx });
  }

  const activeMin =
    (recipe.timings?.prep_minutes || 0) + (recipe.timings?.cook_minutes || 0);
  const totalMin = activeMin + (recipe.timings?.rest_minutes || 0);

  container.innerHTML = `
    <article class="sheet-container">

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
            <button type="button" data-action="open-markdown" data-recipe-id="${escapeHtml(recipe.id)}" class="btn btn-ghost btn-sm" title="Ver o editar fuente Markdown + YAML">
              ${ICONS.code} <span>Markdown</span>
            </button>
            <button type="button" data-action="print-sheet" class="btn btn-ghost btn-sm" title="Imprimir ficha técnica">
              ${ICONS.print} <span>Imprimir</span>
            </button>
            <button type="button" data-action="duplicate-recipe" data-recipe-id="${escapeHtml(recipe.id)}" class="btn btn-ghost btn-sm" title="Crear variante duplicada">
              ${ICONS.copy} <span>Duplicar</span>
            </button>
            <button type="button" data-action="open-editor" data-recipe-id="${escapeHtml(recipe.id)}" class="btn btn-primary btn-sm">
              ${ICONS.edit} <span>Editar</span>
            </button>
            <button type="button" data-action="delete-recipe" data-recipe-id="${escapeHtml(recipe.id)}" class="btn btn-danger-ghost btn-sm" aria-label="Eliminar receta" title="Eliminar receta">
              ${ICONS.trash}
            </button>
          </div>
        </div>

        <div class="sheet-hero-grid ${recipe.cover_photo ? "has-photo" : ""}">
          <div>
            <h1 class="sheet-title">${escapeHtml(recipe.title)}</h1>
            ${recipe.subtitle ? `<p class="sheet-subtitle">${escapeHtml(recipe.subtitle)}</p>` : ""}

            ${
              (recipe.techniques && recipe.techniques.length > 0) ||
              (recipe.tags && recipe.tags.length > 0)
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

      <div id="vinum-pairing-slot"></div>

      <div class="sheet-body-grid">
        <div style="display: flex; flex-direction: column; gap: 28px;">
          <section class="scaler-instrument" aria-label="Escalado de escandallo">
            <div class="scaler-top">
              <span class="scaler-title">Escandallo & Escalado</span>
              <div class="segmented-toggle no-print" role="group" aria-label="Modo de escalado">
                <button
                  type="button"
                  data-action="switch-scaling-mode"
                  data-mode="servings"
                  class="segmented-btn ${state.currentViewScalingMode === "servings" ? "is-active" : ""}"
                >Raciones</button>
                <button
                  type="button"
                  data-action="switch-scaling-mode"
                  data-mode="bakers_pct"
                  class="segmented-btn ${state.currentViewScalingMode === "bakers_pct" ? "is-active" : ""}"
                >% Panadero</button>
              </div>
            </div>

            ${
              state.currentViewScalingMode === "servings"
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
                      data-change-action="scale-servings"
                      data-base-servings="${recipe.servings}"
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
                      data-action="set-scale-factor"
                      data-factor="${factor}"
                      class="preset-btn ${Math.abs(state.currentScaleFactor - factor) < 0.01 ? "is-active" : ""}"
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
                      data-change-action="scale-base-weight"
                      data-base-weight="${baseWeight100}"
                      class="scaler-number-input"
                      aria-label="Peso base en gramos"
                    />
                    <span class="font-mono" style="font-size: 12px; color: var(--ink-inverse-muted);">g</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="display: block; font-size: 11px; color: var(--ink-inverse-muted);">Factor</span>
                  <span class="font-mono" style="font-size: 14px; font-weight: 600;">${(state.currentScaleFactor * 100).toFixed(0)}% (${state.currentScaleFactor.toFixed(2)}x)</span>
                </div>
              </div>
            `
            }
          </section>

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
                        const isChecked = state.checkedIngredients.has(ing._idx);
                        const scaledAmt =
                          ing.amount !== null && ing.amount !== undefined
                            ? formatNumber(ing.amount * state.currentScaleFactor)
                            : "";
                        const pct =
                          baseWeight100 > 0 && ing.amount
                            ? ((ing.amount / baseWeight100) * 100).toFixed(1)
                            : null;

                        return `
                          <li data-action="toggle-ingredient" data-index="${ing._idx}" class="ingredient-row ${isChecked ? "is-checked" : ""}">
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
                                state.currentViewScalingMode === "bakers_pct" && pct !== null
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

        <div style="display: flex; flex-direction: column; gap: 32px;">
          <section class="section-block">
            <div class="section-heading-row">
              <h2 class="section-heading">Procedimiento</h2>
              <span class="section-sub-hint">${(recipe.steps || []).length} pasos</span>
            </div>

            <div class="steps-list">
              ${(recipe.steps || [])
                .map((step, idx) => {
                  const isDone = state.checkedSteps.has(idx);
                  const stepLabel = step.title || `Paso ${idx + 1}`;
                  return `
                    <div class="step-row ${isDone ? "is-done" : ""}">
                      <div class="step-header">
                        <button type="button" class="step-trigger" data-action="toggle-step" data-index="${idx}">
                          <span class="step-index">${isDone ? ICONS.check : step.order || idx + 1}</span>
                          <span class="step-title">${escapeHtml(stepLabel)}</span>
                        </button>

                        <div class="step-badges">
                          ${
                            step.temp_c !== null &&
                            step.temp_c !== undefined &&
                            step.temp_c !== ""
                              ? `<span class="step-temp-pill">${step.temp_c} °C</span>`
                              : ""
                          }
                          ${
                            step.duration_minutes
                              ? `<button
                                  type="button"
                                  data-action="start-timer"
                                  data-timer-label="${escapeHtml(stepLabel)}"
                                  data-timer-minutes="${step.duration_minutes}"
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

          <section class="section-block" style="padding-top: 20px; border-top: 1px solid var(--hairline);">
            <div class="section-heading-row" style="border-bottom: none; padding-bottom: 0;">
              <h2 class="section-heading">Cuaderno I+D</h2>
              <button type="button" data-action="toggle-quick-iteration" class="btn btn-secondary btn-sm no-print">
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
                <button type="button" data-action="toggle-quick-iteration" class="btn btn-ghost btn-sm">Cancelar</button>
                <button type="button" data-action="save-quick-iteration" data-recipe-id="${escapeHtml(recipe.id)}" class="btn btn-accent btn-sm">Guardar nota</button>
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
          <button type="button" data-action="open-utensils-modal" class="btn btn-ghost btn-sm no-print">
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
                            data-action="quick-toggle-utensil"
                            data-utensil-id="${escapeHtml(u.utensil_id)}"
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
                            data-action="quick-toggle-utensil"
                            data-utensil-id="${escapeHtml(u.utensil_id)}"
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
          (recipe.subrecipes && recipe.subrecipes.length > 0) ||
          usedInRecipes.length > 0
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
                        ? formatNumber(sr.amount * state.currentScaleFactor)
                        : "";
                    const targetExists = state.allRecipes.some(
                      (r) => r.id === sr.recipe_id
                    );
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
                            ? `<button type="button" data-action="select-recipe" data-recipe-id="${escapeHtml(sr.recipe_id)}" class="btn btn-secondary btn-sm">
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
                    <button type="button" data-action="select-recipe" data-recipe-id="${escapeHtml(parent.id)}" class="btn btn-secondary btn-sm">
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

  if (state.wineSuggestionCache.has(recipe.id)) {
    renderWineSuggestionSlot(
      document.getElementById("vinum-pairing-slot"),
      state.wineSuggestionCache.get(recipe.id)
    );
  }
}

export function openUtensilsModal() {
  const modal = document.getElementById("utensils-modal");
  if (!modal) return;
  modal.classList.remove("is-hidden");
  renderUtensilsCatalogModal();
}

export function closeUtensilsModal() {
  document.getElementById("utensils-modal")?.classList.add("is-hidden");
}

export function renderUtensilsCatalogModal() {
  const container = document.getElementById("utensils-catalog-list");
  if (!container) return;

  const byCat = {};
  for (const u of state.utensilsCatalog) {
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
                  data-change-action="toggle-catalog-utensil"
                  data-utensil-id="${escapeHtml(u.id)}"
                  style="margin-top: 3px; width: 15px; height: 15px; accent-color: var(--flame-blue);"
                />
                <div>
                  <div style="font-size: 13px; font-weight: 600;">${escapeHtml(u.name)}</div>
                  ${u.specs ? `<div style="font-size: 11.5px; color: var(--ink-tertiary);">${escapeHtml(u.specs)}</div>` : ""}
                </div>
              </label>
              <button
                type="button"
                data-action="delete-catalog-utensil"
                data-utensil-id="${escapeHtml(u.id)}"
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

export async function openMarkdownModal(recipeId) {
  state.currentMdRecipeId = recipeId;
  const res = await api.fetchRecipeMarkdown(recipeId);
  if (!res.ok) return;
  const text = await res.text();
  document.getElementById("md-modal-filename").textContent = `${recipeId}.md`;
  document.getElementById("raw-markdown-textarea").value = text;
  document.getElementById("markdown-modal").classList.remove("is-hidden");
}

export function closeMarkdownModal() {
  document.getElementById("markdown-modal")?.classList.add("is-hidden");
}

export function downloadRawMarkdown() {
  if (!state.currentMdRecipeId) return;
  const content = document.getElementById("raw-markdown-textarea").value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.currentMdRecipeId}.md`;
  a.click();
}

export async function copyRawMarkdown() {
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

export function renderEmptyState() {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div style="color: var(--ink-tertiary);">${ICONS.book}</div>
      <h2 class="section-heading">Tu recetario técnico está listo</h2>
      <p style="font-size: 13.5px; max-width: 44ch;">
        Selecciona una elaboración en el índice izquierdo o crea una nueva ficha técnica con escandallo y maridaje.
      </p>
      <button type="button" data-action="open-editor" class="btn btn-accent">
        ${ICONS.plus} <span>Crear primera receta</span>
      </button>
    </div>
  `;
}

export function renderErrorState(message) {
  const container = document.getElementById("recipe-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <h2 class="section-heading" style="color: var(--thermal-red);">Error de conexión</h2>
      <p style="font-size: 13.5px; max-width: 46ch;">${escapeHtml(message)}</p>
      <button type="button" data-action="reload-initial" class="btn btn-secondary">Reintentar</button>
    </div>
  `;
}
