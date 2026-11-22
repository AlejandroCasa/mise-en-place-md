// ============================================================================
// Mise en Place MD — Shared Application State & Pure Domain Helpers
// ============================================================================

import { CANONICAL_CATEGORY_ORDER } from "./constants.js";

export const state = {
  allRecipes: [],
  filteredRecipes: [],
  utensilsCatalog: [],
  activeRecipeId: null,
  currentScaleFactor: 1.0,
  currentViewScalingMode: null, // "servings" | "bakers_pct"
  checkedIngredients: new Set(),
  checkedSteps: new Set(),
  activeTimers: [],
  timerInterval: null,
  wakeLockSentinel: null,
  wineSuggestionCache: new Map(),
  openCategories: new Set(),
  hasActiveFilters: false,
  editingDraft: null,
  editingOriginalId: null,
  currentMdRecipeId: null,
};

export function extractSlugFromPath(pathname) {
  const match = String(pathname || "").match(/^\/recipes\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getUtensilMap(utensils = state.utensilsCatalog) {
  const map = {};
  for (const u of utensils) {
    map[u.id] = u;
  }
  return map;
}

export function checkRecipeEquipmentStatus(recipe, utensils = state.utensilsCatalog) {
  const uMap = getUtensilMap(utensils);
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

export function filterAndSortRecipes(recipes, filters, utensils = state.utensilsCatalog) {
  const q = (filters.q || "").trim().toLowerCase();
  const cookableToday = Boolean(filters.cookableToday);
  const includeTerms = (filters.ingInclude || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excludeTerms = (filters.ingExclude || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cat = filters.category || "";
  const subType = filters.subType || "all";
  const utensilId = filters.utensilId || "";
  const technique = filters.technique || "";
  const sortBy = filters.sortBy || "updated_desc";

  const filtered = recipes.filter((r) => {
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

    if (cookableToday && !checkRecipeEquipmentStatus(r, utensils).canCookMandatory) {
      return false;
    }

    if (includeTerms.length > 0) {
      const ingText = (r.ingredients || [])
        .map((i) => `${i.name} ${i.notes || ""}`)
        .join(" ")
        .toLowerCase();
      for (const term of includeTerms) {
        if (!ingText.includes(term)) return false;
      }
    }

    if (excludeTerms.length > 0) {
      const ingText = (r.ingredients || [])
        .map((i) => `${i.name} ${i.notes || ""}`)
        .join(" ")
        .toLowerCase();
      for (const term of excludeTerms) {
        if (ingText.includes(term)) return false;
      }
    }

    if (cat && r.category !== cat) return false;
    if (subType === "main" && r.is_subrecipe) return false;
    if (subType === "sub" && !r.is_subrecipe) return false;
    if (utensilId && !(r.utensils || []).some((u) => u.utensil_id === utensilId)) {
      return false;
    }
    if (technique && !(r.techniques || []).includes(technique)) return false;

    return true;
  });

  filtered.sort((a, b) => {
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

  return filtered;
}

export function getBaseWeightTotal(recipe) {
  const baseItems = (recipe.ingredients || []).filter((i) => i.is_base_weight && i.amount);
  if (baseItems.length > 0) {
    return baseItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }
  const firstWithAmount = (recipe.ingredients || []).find((i) => i.amount && i.amount > 0);
  return firstWithAmount ? Number(firstWithAmount.amount) : 1000;
}

export function computeScaleFactorFromServings(newServings, baseServings) {
  const val = parseFloat(newServings);
  if (!val || val <= 0 || !baseServings) return null;
  return val / baseServings;
}

export function computeScaleFactorFromBaseWeight(newBaseWeight, originalBaseWeight) {
  const val = parseFloat(newBaseWeight);
  if (!val || val <= 0 || !originalBaseWeight) return null;
  return val / originalBaseWeight;
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function sortCategoriesCanonical(categories) {
  return [...categories].sort((a, b) => {
    const idxA = CANONICAL_CATEGORY_ORDER.indexOf(a);
    const idxB = CANONICAL_CATEGORY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, "es");
  });
}

export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return "";
  return (Math.round(Number(val) * 100) / 100).toString();
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
