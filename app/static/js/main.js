// ============================================================================
// Mise en Place MD — Bootstrap, Routing & Centralized Event Delegation
// ============================================================================

import * as api from "./api.js";
import * as editor from "./editor.js";
import {
  computeScaleFactorFromBaseWeight,
  computeScaleFactorFromServings,
  extractSlugFromPath,
  state,
} from "./state.js";
import * as timers from "./timers.js";
import * as views from "./views.js";

export async function loadInitialData(selectId = null) {
  try {
    const data = await api.fetchBootstrapData();
    state.allRecipes = data.recipes;
    state.utensilsCatalog = data.utensils;
  } catch {
    views.renderErrorState("No se pudo conectar con la API de Atelier Culinario.");
    return;
  }

  views.updateUtensilHeaderCounter();
  views.populateFilterDropdowns();
  views.applyFilters();

  if (selectId && state.allRecipes.some((r) => r.id === selectId)) {
    selectRecipe(selectId, { pushHistory: false });
  } else if (
    state.activeRecipeId &&
    state.allRecipes.some((r) => r.id === state.activeRecipeId)
  ) {
    selectRecipe(state.activeRecipeId, { pushHistory: false });
  } else if (state.filteredRecipes.length > 0) {
    selectRecipe(state.filteredRecipes[0].id, { pushHistory: false });
  } else {
    views.renderEmptyState();
  }
}

export function selectRecipe(recipeId, { pushHistory = true } = {}) {
  const recipe = state.allRecipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  state.activeRecipeId = recipeId;
  if (recipe.category) {
    state.openCategories.add(recipe.category);
  }
  state.currentScaleFactor = 1.0;
  state.currentViewScalingMode = recipe.scaling_mode || "servings";
  state.checkedIngredients.clear();
  state.checkedSteps.clear();

  if (pushHistory) {
    const targetPath = `/recipes/${encodeURIComponent(recipeId)}`;
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, "", targetPath);
    }
  }

  views.renderRecipeList();
  views.renderRecipeDetail(recipe);
  loadWineSuggestion(recipeId);
}

export async function loadWineSuggestion(recipeId) {
  const slot = document.getElementById("vinum-pairing-slot");
  if (!slot) return;

  if (state.wineSuggestionCache.has(recipeId)) {
    views.renderWineSuggestionSlot(slot, state.wineSuggestionCache.get(recipeId));
    return;
  }

  slot.innerHTML = `
    <div class="vinum-strip">
      <div class="vinum-strip-header">
        <span class="vinum-heading"><span>Maridaje Vinum Pulse</span></span>
        <span class="vinum-source-badge">Consultando bodega...</span>
      </div>
    </div>
  `;

  try {
    const res = await api.fetchWineSuggestion(recipeId);
    if (!res.ok) {
      state.wineSuggestionCache.set(recipeId, null);
      if (state.activeRecipeId === recipeId) views.renderWineSuggestionSlot(slot, null);
      return;
    }
    const data = await res.json();
    state.wineSuggestionCache.set(recipeId, data);
    if (state.activeRecipeId === recipeId) {
      views.renderWineSuggestionSlot(slot, data);
    }
  } catch {
    if (state.activeRecipeId === recipeId) views.renderWineSuggestionSlot(slot, null);
  }
}

function rerenderActiveRecipe() {
  const recipe = state.allRecipes.find((r) => r.id === state.activeRecipeId);
  if (recipe) views.renderRecipeDetail(recipe);
}

async function saveQuickIteration(recipeId) {
  const recipe = state.allRecipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  const version =
    document.getElementById("quick-it-version")?.value.trim() || "v1.1";
  const date =
    document.getElementById("quick-it-date")?.value ||
    new Date().toISOString().slice(0, 10);
  const changes = document.getElementById("quick-it-changes")?.value.trim() || "";
  const next_steps = document.getElementById("quick-it-next")?.value.trim() || "";

  if (!changes) {
    alert("Escribe los cambios o resultados de la prueba.");
    return;
  }

  const updated = structuredClone(recipe);
  updated.iterations = updated.iterations || [];
  updated.iterations.push({ version, date, changes, next_steps });

  const res = await api.saveRecipePayload(updated, recipeId);
  if (res.ok) {
    await loadInitialData(recipeId);
  }
}

async function quickToggleUtensilOwned(utensilId) {
  const item = state.utensilsCatalog.find((u) => u.id === utensilId);
  if (!item) return;
  item.owned = !item.owned;
  await api.saveUtensilsCatalog(state.utensilsCatalog);
  views.updateUtensilHeaderCounter();
  views.populateFilterDropdowns();
  views.applyFilters();
  rerenderActiveRecipe();
}

async function toggleCatalogUtensilOwned(utensilId, isOwned) {
  const item = state.utensilsCatalog.find((u) => u.id === utensilId);
  if (!item) return;
  item.owned = isOwned;
  await api.saveUtensilsCatalog(state.utensilsCatalog);
  views.updateUtensilHeaderCounter();
  views.populateFilterDropdowns();
  views.applyFilters();
  views.renderUtensilsCatalogModal();
  rerenderActiveRecipe();
}

async function addNewCatalogUtensil() {
  const nameEl = document.getElementById("new-utensil-name");
  const catEl = document.getElementById("new-utensil-category");
  const specsEl = document.getElementById("new-utensil-specs");
  const name = (nameEl?.value || "").trim();
  if (!name) return;

  const res = await api.createCatalogUtensil({
    id: "",
    name,
    category: catEl?.value || "Cocción",
    owned: true,
    specs: (specsEl?.value || "").trim(),
  });
  if (res.ok) {
    nameEl.value = "";
    specsEl.value = "";
    const utRes = await api.fetchUtensils();
    state.utensilsCatalog = await utRes.json();
    views.updateUtensilHeaderCounter();
    views.populateFilterDropdowns();
    views.renderUtensilsCatalogModal();
  }
}

async function deleteCatalogUtensil(utensilId) {
  state.utensilsCatalog = state.utensilsCatalog.filter((u) => u.id !== utensilId);
  await api.saveUtensilsCatalog(state.utensilsCatalog);
  views.updateUtensilHeaderCounter();
  views.populateFilterDropdowns();
  views.renderUtensilsCatalogModal();
}

async function saveRawMarkdownChanges() {
  if (!state.currentMdRecipeId) return;
  const content = document.getElementById("raw-markdown-textarea")?.value || "";
  const res = await api.saveRecipeMarkdown(state.currentMdRecipeId, content);
  if (res.ok) {
    const updated = await res.json();
    state.wineSuggestionCache.delete(updated.id);
    views.closeMarkdownModal();
    await loadInitialData(updated.id);
  } else {
    alert("Error al parsear el YAML Frontmatter del archivo Markdown.");
  }
}

async function handleClickAction(el) {
  const action = el.dataset.action;
  switch (action) {
    case "toggle-kitchen-mode":
      await timers.toggleKitchenMode();
      break;
    case "open-utensils-modal":
      views.openUtensilsModal();
      break;
    case "close-utensils-modal":
      views.closeUtensilsModal();
      break;
    case "add-catalog-utensil":
      await addNewCatalogUtensil();
      break;
    case "delete-catalog-utensil":
      await deleteCatalogUtensil(el.dataset.utensilId || "");
      break;
    case "open-editor":
      editor.openRecipeEditor(el.dataset.recipeId || null);
      break;
    case "cancel-editor":
      editor.cancelRecipeEditor((id) => selectRecipe(id));
      break;
    case "save-editor":
      await editor.saveRecipeFromEditor((id) => loadInitialData(id));
      break;
    case "editor-add-utensil-catalog":
      editor.editorAddUtensilFromCatalog();
      break;
    case "editor-add-utensil-custom":
      editor.editorAddCustomUtensil();
      break;
    case "editor-add-subrecipe":
      editor.editorAddSubrecipe();
      break;
    case "editor-add-temperature":
      editor.editorAddRow("temperatures");
      break;
    case "editor-add-ingredient":
      editor.editorAddRow("ingredients");
      break;
    case "editor-add-step":
      editor.editorAddRow("steps");
      break;
    case "editor-remove-row":
      editor.editorRemoveRow(
        el.dataset.editorCollection || "",
        parseInt(el.dataset.index || "-1", 10)
      );
      break;
    case "reset-filters":
      views.resetAllFilters();
      break;
    case "select-recipe":
      selectRecipe(el.dataset.recipeId || "");
      break;
    case "open-markdown":
      await views.openMarkdownModal(el.dataset.recipeId || "");
      break;
    case "close-markdown-modal":
      views.closeMarkdownModal();
      break;
    case "download-markdown":
      views.downloadRawMarkdown();
      break;
    case "copy-markdown":
      await views.copyRawMarkdown();
      break;
    case "save-markdown":
      await saveRawMarkdownChanges();
      break;
    case "print-sheet":
      window.print();
      break;
    case "duplicate-recipe":
      await editor.duplicateRecipe(el.dataset.recipeId || "", (id) =>
        loadInitialData(id)
      );
      break;
    case "delete-recipe":
      await editor.confirmDeleteRecipe(el.dataset.recipeId || "", (id) =>
        loadInitialData(id)
      );
      break;
    case "switch-scaling-mode":
      state.currentViewScalingMode = el.dataset.mode || "servings";
      rerenderActiveRecipe();
      break;
    case "set-scale-factor":
      state.currentScaleFactor = Number(el.dataset.factor) || 1.0;
      rerenderActiveRecipe();
      break;
    case "toggle-ingredient": {
      const idx = parseInt(el.dataset.index || "-1", 10);
      if (idx >= 0) {
        if (state.checkedIngredients.has(idx)) state.checkedIngredients.delete(idx);
        else state.checkedIngredients.add(idx);
        rerenderActiveRecipe();
      }
      break;
    }
    case "toggle-step": {
      const idx = parseInt(el.dataset.index || "-1", 10);
      if (idx >= 0) {
        if (state.checkedSteps.has(idx)) state.checkedSteps.delete(idx);
        else state.checkedSteps.add(idx);
        rerenderActiveRecipe();
      }
      break;
    }
    case "start-timer":
      timers.startKitchenTimer(
        el.dataset.timerLabel || "Temporizador",
        parseFloat(el.dataset.timerMinutes || "1")
      );
      break;
    case "toggle-pause-timer":
      timers.togglePauseTimer(el.dataset.timerId || "");
      break;
    case "remove-timer":
      timers.removeTimer(el.dataset.timerId || "");
      break;
    case "toggle-quick-iteration":
      document.getElementById("quick-iteration-form")?.classList.toggle("is-hidden");
      break;
    case "save-quick-iteration":
      await saveQuickIteration(el.dataset.recipeId || "");
      break;
    case "quick-toggle-utensil":
      await quickToggleUtensilOwned(el.dataset.utensilId || "");
      break;
    case "reload-initial":
      await loadInitialData();
      break;
    default:
      break;
  }
}

async function handleChangeAction(el) {
  const action = el.dataset.changeAction;
  switch (action) {
    case "apply-filters":
      views.applyFilters();
      break;
    case "scale-servings": {
      const factor = computeScaleFactorFromServings(
        el.value,
        parseFloat(el.dataset.baseServings || "0")
      );
      if (factor !== null) {
        state.currentScaleFactor = factor;
        rerenderActiveRecipe();
      }
      break;
    }
    case "scale-base-weight": {
      const factor = computeScaleFactorFromBaseWeight(
        el.value,
        parseFloat(el.dataset.baseWeight || "0")
      );
      if (factor !== null) {
        state.currentScaleFactor = factor;
        rerenderActiveRecipe();
      }
      break;
    }
    case "toggle-catalog-utensil":
      await toggleCatalogUtensilOwned(
        el.dataset.utensilId || "",
        Boolean(el.checked)
      );
      break;
    case "upload-cover-photo":
      await editor.uploadCoverPhoto(el);
      break;
    case "upload-step-photo":
      await editor.uploadStepPhoto(el, parseInt(el.dataset.index || "0", 10));
      break;
    default:
      break;
  }
}

function setupEventDelegation() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches("[data-backdrop-close]")) {
      const modalId = target.dataset.backdropClose;
      if (modalId === "utensils-modal") views.closeUtensilsModal();
      if (modalId === "markdown-modal") views.closeMarkdownModal();
      return;
    }

    const actionEl = target.closest("[data-action]");
    if (actionEl instanceof HTMLElement) {
      void handleClickAction(actionEl);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.inputAction === "apply-filters") {
      views.applyFilters();
      return;
    }
    if (target.dataset.editorCollection) {
      editor.handleEditorFieldUpdate(target);
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.changeAction) {
      void handleChangeAction(target);
      return;
    }
    if (target.dataset.editorCollection) {
      editor.handleEditorFieldUpdate(target);
    }
  });

  const railList = document.getElementById("recipe-list-container");
  if (railList) {
    railList.addEventListener(
      "toggle",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLDetailsElement && target.dataset.category) {
          views.handleCategoryToggle(target, target.dataset.category);
        }
      },
      true
    );
  }
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
      views.closeUtensilsModal();
      views.closeMarkdownModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupEventDelegation();
  setupKeyboardShortcuts();
  const deepLinkSlug = extractSlugFromPath(window.location.pathname);
  await loadInitialData(deepLinkSlug);
});

window.addEventListener("popstate", () => {
  const slug = extractSlugFromPath(window.location.pathname);
  if (slug && state.allRecipes.some((r) => r.id === slug)) {
    selectRecipe(slug, { pushHistory: false });
  }
});
