// ============================================================================
// Mise en Place MD — Multi-Course Service Planner, Cellar Reverse & Quick Capture
// ============================================================================

import * as api from "./api.js";
import { ICONS, WINE_TYPE_ES } from "./constants.js";
import { escapeHtml, formatDuration, formatNumber, state } from "./state.js";

// ----------------------------------------------------------------------------
// 1. Reverse Cellar Pairing ("Cocina desde tu Bodega")
// ----------------------------------------------------------------------------

export async function openCellarModal() {
  const modal = document.getElementById("cellar-modal");
  if (!modal) return;
  modal.classList.remove("is-hidden");
  renderCellarModalLoading();

  try {
    const res = await api.fetchCellarBottles();
    state.cellarBottles = res.ok ? await res.json() : [];
    if (state.cellarBottles.length > 0 && !state.selectedCellarBottleSlug) {
      await selectCellarBottle(state.cellarBottles[0].wine.slug);
      return;
    }
    renderCellarModal();
  } catch {
    state.cellarBottles = [];
    renderCellarModal();
  }
}

export function closeCellarModal() {
  document.getElementById("cellar-modal")?.classList.add("is-hidden");
}

export async function selectCellarBottle(wineSlug) {
  state.selectedCellarBottleSlug = wineSlug;
  state.cellarBottleMatches = null;
  renderCellarModal();
  try {
    const res = await api.fetchRecipesForCellarBottle(wineSlug);
    if (res.ok) {
      state.cellarBottleMatches = await res.json();
    }
  } catch {
    state.cellarBottleMatches = null;
  }
  renderCellarModal();
}

function renderCellarModalLoading() {
  const body = document.getElementById("cellar-modal-body");
  if (!body) return;
  body.innerHTML = `<p style="font-size: 13px; color: var(--ink-tertiary);">Consultando inventario en <code class="font-mono">enology.cellar_items</code>...</p>`;
}

export function renderCellarModal() {
  const body = document.getElementById("cellar-modal-body");
  if (!body) return;

  if (!state.cellarBottles || state.cellarBottles.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <div style="color: var(--vinum-burgundy);">${ICONS.wine}</div>
        <h3 class="section-heading">Sin botellas registradas en bodega</h3>
        <p style="font-size: 13px; max-width: 46ch;">
          Añade botellas a tu bodega en Vinum Pulse (<code class="font-mono">enology.cellar_items</code>) para descubrir al instante qué recetas de tu recetario maridan mejor con cada botella.
        </p>
      </div>
    `;
    return;
  }

  const bottlesHtml = state.cellarBottles
    .map((item) => {
      const w = item.wine;
      const isSelected = w.slug === state.selectedCellarBottleSlug;
      const typeEs = WINE_TYPE_ES[w.wine_type] || w.wine_type;
      return `
        <button
          type="button"
          data-action="select-cellar-bottle"
          data-wine-slug="${escapeHtml(w.slug)}"
          class="cellar-bottle-btn ${isSelected ? "is-selected" : ""}"
        >
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
            <strong style="font-size:13px;">${escapeHtml(w.name)}</strong>
            <span class="meta-pill font-mono">${item.quantity} uds.</span>
          </div>
          <div style="font-size:11.5px;color:var(--ink-tertiary);margin-top:2px;">
            ${escapeHtml(typeEs)} · ${escapeHtml(w.appellation)} · ${escapeHtml(String(w.vintage))}
          </div>
          <div style="font-size:11px;color:var(--ink-muted);margin-top:2px;">
            ${escapeHtml(item.storage_location || "Bodega Principal")}
          </div>
        </button>
      `;
    })
    .join("");

  const matchesData = state.cellarBottleMatches;
  let matchesHtml = `<p style="font-size:13px;color:var(--ink-tertiary);">Selecciona una botella para calcular afinidades.</p>`;
  if (matchesData && Array.isArray(matchesData.matches)) {
    matchesHtml =
      matchesData.matches.length === 0
        ? `<p style="font-size:13px;color:var(--ink-tertiary);">No hay recetas principales disponibles para comparar.</p>`
        : matchesData.matches
            .map(
              (m) => `
          <div class="cellar-match-row">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:13.5px;">${escapeHtml(m.recipe_title)}</strong>
                <span class="meta-pill">${escapeHtml(m.category)}</span>
              </div>
              <p style="font-size:12px;color:var(--ink-secondary);margin-top:3px;">${escapeHtml(m.rationale)}</p>
              <div class="font-mono" style="font-size:11px;color:var(--ink-tertiary);margin-top:3px;">
                Afinidad ${formatNumber(m.compatibility_score)}% · ${formatDuration(m.total_minutes)} · Dif ${m.difficulty}/5
              </div>
            </div>
            <button
              type="button"
              data-action="open-recipe-from-modal"
              data-recipe-id="${escapeHtml(m.recipe_slug)}"
              class="btn btn-secondary btn-sm"
            >
              <span>Abrir</span> ${ICONS.arrowRight}
            </button>
          </div>
        `
            )
            .join("");
  }

  body.innerHTML = `
    <div class="cellar-split-grid">
      <div class="cellar-bottle-col">
        <div class="equipment-col-title">Botellas en Bodega (${state.cellarBottles.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;">${bottlesHtml}</div>
      </div>
      <div class="cellar-matches-col">
        <div class="equipment-col-title">Recetas recomendadas para esta botella</div>
        <div style="display:flex;flex-direction:column;gap:10px;">${matchesHtml}</div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 2. Multi-Course Menu & Dinner Service Planner
// ----------------------------------------------------------------------------

export function openMenuPlannerModal() {
  const modal = document.getElementById("menu-planner-modal");
  if (!modal) return;
  if (state.menuPlanCourses.length === 0) {
    const mainRecipes = state.allRecipes.filter((r) => !r.is_subrecipe);
    const seedList = (mainRecipes.length >= 2 ? mainRecipes : state.allRecipes).slice(0, 2);
    state.menuPlanCourses = seedList.map((r) => ({
      recipe_slug: r.id,
      servings: Number(r.servings) || 4,
    }));
  }
  modal.classList.remove("is-hidden");
  renderMenuPlannerModal();
}

export function closeMenuPlannerModal() {
  document.getElementById("menu-planner-modal")?.classList.add("is-hidden");
}

export function addMenuCourse() {
  if (state.menuPlanCourses.length >= 8) return;
  const candidate =
    state.allRecipes.find(
      (r) => !r.is_subrecipe && !state.menuPlanCourses.some((c) => c.recipe_slug === r.id)
    ) || state.allRecipes[0];
  if (!candidate) return;
  state.menuPlanCourses.push({
    recipe_slug: candidate.id,
    servings: Number(candidate.servings) || 4,
  });
  renderMenuPlannerModal();
}

export function removeMenuCourse(idx) {
  if (state.menuPlanCourses.length <= 1) return;
  state.menuPlanCourses.splice(idx, 1);
  renderMenuPlannerModal();
}

export function updateMenuCourseField(idx, field, value) {
  const row = state.menuPlanCourses[idx];
  if (!row) return;
  if (field === "servings") {
    row.servings = Math.max(1, parseFloat(value) || 4);
  } else if (field === "recipe_slug") {
    row.recipe_slug = value;
  }
}

export async function runMenuPlan() {
  const timeInput = document.getElementById("menu-service-time");
  if (timeInput && timeInput.value) {
    state.menuPlanServiceTime = timeInput.value;
  }
  const res = await api.buildMenuPlan(state.menuPlanCourses, state.menuPlanServiceTime);
  if (res.ok) {
    state.menuPlanResult = await res.json();
    renderMenuPlannerModal();
  } else {
    alert("No se pudo calcular el plan de servicio.");
  }
}

export async function copyMenuShoppingList() {
  const plan = state.menuPlanResult;
  if (!plan || !plan.shopping_list) return;
  const lines = plan.shopping_list.map(
    (item) =>
      `- ${item.total_amount !== null ? formatNumber(item.total_amount) : ""} ${item.unit} ${item.name}`.trim()
  );
  await navigator.clipboard.writeText(lines.join("\n"));
  const btn = document.getElementById("btn-copy-shopping-list");
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = "Copiada";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1400);
  }
}

export function renderMenuPlannerModal() {
  const body = document.getElementById("menu-planner-modal-body");
  if (!body) return;

  const recipeOptions = state.allRecipes
    .filter((r) => !r.is_subrecipe)
    .concat(state.allRecipes.filter((r) => r.is_subrecipe));

  const coursesHtml = state.menuPlanCourses
    .map(
      (course, idx) => `
      <div class="editor-row-box editor-grid-12" style="align-items:center;">
        <div class="col-1 font-mono" style="font-size:12px;color:var(--ink-tertiary);">P${idx + 1}</div>
        <div class="col-7">
          <select
            data-change-action="menu-course-recipe"
            data-index="${idx}"
            class="control-select"
          >
            ${recipeOptions
              .map(
                (r) =>
                  `<option value="${escapeHtml(r.id)}" ${
                    r.id === course.recipe_slug ? "selected" : ""
                  }>${escapeHtml(r.title)} (${escapeHtml(r.category)})</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="col-3" style="display:flex;align-items:center;gap:6px;">
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value="${course.servings}"
            data-change-action="menu-course-servings"
            data-index="${idx}"
            class="control-input font-mono"
            aria-label="Comensales del pase ${idx + 1}"
          />
          <span style="font-size:11.5px;color:var(--ink-tertiary);">com.</span>
        </div>
        <div class="col-1" style="text-align:right;">
          <button
            type="button"
            data-action="remove-menu-course"
            data-index="${idx}"
            class="btn btn-danger-ghost btn-sm"
            aria-label="Quitar pase"
          >${ICONS.close}</button>
        </div>
      </div>
    `
    )
    .join("");

  const plan = state.menuPlanResult;
  const resultHtml = plan ? renderMenuPlanResult(plan) : "";

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="planner-toolbar">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label for="menu-service-time" class="field-label" style="margin:0;">Hora objetivo de pase</label>
          <input
            id="menu-service-time"
            type="time"
            value="${escapeHtml(state.menuPlanServiceTime)}"
            class="control-input font-mono"
            style="width:120px;"
          />
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" data-action="add-menu-course" class="btn btn-secondary btn-sm">
            ${ICONS.plus} <span>Añadir pase</span>
          </button>
          <button type="button" data-action="run-menu-plan" class="btn btn-accent btn-sm">
            <span>Calcular Servicio y Compra</span>
          </button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${coursesHtml}
      </div>

      ${resultHtml}
    </div>
  `;
}

function renderMenuPlanResult(plan) {
  const economicsHtml =
    plan.total_menu_cost_eur !== null
      ? `
    <div class="costing-strip">
      <div class="costing-cell">
        <span class="telemetry-label">Escandallo platos</span>
        <span class="costing-value">${plan.total_food_cost_eur !== null ? `${formatNumber(plan.total_food_cost_eur)} €` : "Sin datos"}</span>
      </div>
      <div class="costing-cell">
        <span class="telemetry-label">Vinos Vinum Pulse</span>
        <span class="costing-value">${plan.total_wine_cost_eur !== null ? `${formatNumber(plan.total_wine_cost_eur)} €` : "N/D"}</span>
      </div>
      <div class="costing-cell">
        <span class="telemetry-label">Total Menú + Vino</span>
        <span class="costing-value">${formatNumber(plan.total_menu_cost_eur)} €</span>
      </div>
      <div class="costing-cell">
        <span class="telemetry-label">Coste / comensal</span>
        <span class="costing-value accent">${plan.cost_per_guest_eur !== null ? `${formatNumber(plan.cost_per_guest_eur)} €` : "N/D"}</span>
      </div>
    </div>
  `
      : "";

  const shoppingHtml = (plan.shopping_list || [])
    .map(
      (item) => `
      <li class="ingredient-row">
        <div class="ingredient-left">
          <div>
            <span class="ingredient-name">${escapeHtml(item.name)}</span>
            <div class="ingredient-note">${escapeHtml((item.sources || []).join(" · "))}</div>
          </div>
        </div>
        <div class="ingredient-qty">
          <div>${item.total_amount !== null ? formatNumber(item.total_amount) : ""} ${escapeHtml(item.unit)}</div>
          ${item.estimated_cost_eur !== null ? `<div class="ingredient-pct">${formatNumber(item.estimated_cost_eur)} €</div>` : ""}
        </div>
      </li>
    `
    )
    .join("");

  const timelineHtml = (plan.timeline || [])
    .map(
      (step) => `
      <div class="timeline-row timeline-${escapeHtml(step.kind)}">
        <div class="timeline-clock font-mono">
          <strong>${escapeHtml(step.clock_time)}</strong>
          <span>T-${step.offset_minutes}m</span>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--ink-primary);">${escapeHtml(step.title)}</div>
          <div style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(step.detail)}</div>
        </div>
      </div>
    `
    )
    .join("");

  return `
    ${economicsHtml}
    <div class="planner-result-grid">
      <div>
        <div class="section-heading-row" style="margin-bottom:10px;">
          <h3 class="section-heading">Lista de Compra Agregada (${plan.shopping_list.length})</h3>
          <button id="btn-copy-shopping-list" type="button" data-action="copy-shopping-list" class="btn btn-secondary btn-sm">Copiar</button>
        </div>
        <ul class="ingredient-list">${shoppingHtml}</ul>
      </div>
      <div>
        <div class="section-heading-row" style="margin-bottom:10px;">
          <h3 class="section-heading">Cuenta Atrás al Pase (${escapeHtml(plan.service_time)})</h3>
        </div>
        <div class="timeline-list">${timelineHtml}</div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 3. Quick-Capture Inbox Modal
// ----------------------------------------------------------------------------

export function openQuickCaptureModal() {
  document.getElementById("quick-capture-modal")?.classList.remove("is-hidden");
}

export function closeQuickCaptureModal() {
  document.getElementById("quick-capture-modal")?.classList.add("is-hidden");
}
