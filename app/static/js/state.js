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
  wakeLockActive: false,
  kitchenModeActive: false,
  kitchenStepIndex: 0,
  wineSuggestionCache: new Map(),
  openCategories: new Set(),
  hasActiveFilters: false,
  editingDraft: null,
  editingOriginalId: null,
  currentMdRecipeId: null,
  pantrySelection: new Set(),
  cellarBottles: [],
  selectedCellarBottleSlug: null,
  cellarBottleMatches: null,
  menuPlanCourses: [],
  menuPlanServiceTime: "21:00",
  menuPlanResult: null,
  iterationCompareA: 0,
  iterationCompareB: 1,
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

export function buildRecipeQueryParams(filters = {}) {
  const params = new URLSearchParams();
  const q = (filters.q || "").trim();
  if (q) params.set("q", q);
  if (filters.cookableToday) params.set("cookable", "true");
  const ingInclude = (filters.ingInclude || "").trim();
  if (ingInclude) params.set("ing_include", ingInclude);
  const ingExclude = (filters.ingExclude || "").trim();
  if (ingExclude) params.set("ing_exclude", ingExclude);
  if (filters.category) params.set("category", filters.category);
  if (filters.subType === "main") params.set("is_subrecipe", "false");
  else if (filters.subType === "sub") params.set("is_subrecipe", "true");
  if (filters.utensilId) params.set("utensil_id", filters.utensilId);
  if (filters.technique) params.set("technique", filters.technique);
  const sortBy = filters.sortBy || (q ? "relevance" : "updated_desc");
  if (sortBy) params.set("sort_by", sortBy);
  return params;
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

const STOPWORDS_ES = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
  "sin",
  "para",
  "en",
  "al",
  "y",
  "o",
  "un",
  "una",
  "extra",
  "virgen",
  "fresco",
  "fresca",
]);

export function matchIngredientsForStep(step, ingredients = [], scaleFactor = 1.0) {
  if (!step || !Array.isArray(ingredients) || ingredients.length === 0) {
    return { matched: [], isContextual: false };
  }
  const stepText = `${step.title || ""} ${step.instruction || ""}`.toLowerCase();
  const matched = [];
  for (const ing of ingredients) {
    const tokens = String(ing.name || "")
      .toLowerCase()
      .split(/[\s,()/-]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS_ES.has(t));
    const hits = tokens.some((tok) => stepText.includes(tok));
    if (hits) {
      matched.push({
        ...ing,
        scaledAmount:
          ing.amount !== null && ing.amount !== undefined
            ? formatNumber(ing.amount * scaleFactor)
            : "",
      });
    }
  }
  if (matched.length > 0) {
    return { matched, isContextual: true };
  }
  return {
    matched: ingredients.slice(0, 6).map((ing) => ({
      ...ing,
      scaledAmount:
        ing.amount !== null && ing.amount !== undefined
          ? formatNumber(ing.amount * scaleFactor)
          : "",
    })),
    isContextual: false,
  };
}

export function computeRecipeCostMetrics(recipe, wineSuggestion = null, scaleFactor = 1.0) {
  const ingredients = recipe?.ingredients || [];
  let pricedCount = 0;
  let totalFood = 0;
  for (const ing of ingredients) {
    if (ing.unit_cost_eur === null || ing.unit_cost_eur === undefined || ing.amount === null || ing.amount === undefined) {
      continue;
    }
    let qty = Number(ing.amount) * scaleFactor;
    const unit = String(ing.unit || "").trim().toLowerCase();
    if (unit === "g" || unit === "gr" || unit === "ml") qty /= 1000;
    else if (unit === "cl") qty /= 100;
    totalFood += qty * Number(ing.unit_cost_eur);
    pricedCount += 1;
  }

  const baseServings = Number(recipe?.servings) || 1;
  const scaledServings = Math.max(0.1, baseServings * scaleFactor);
  const foodTotal = pricedCount > 0 ? Math.round(totalFood * 100) / 100 : null;
  const foodPerServing = foodTotal !== null ? Math.round((foodTotal / scaledServings) * 100) / 100 : null;
  const winePrice = wineSuggestion?.recommended_wine?.price_eur ?? null;
  const winePerServing = winePrice !== null ? Math.round((Number(winePrice) / scaledServings) * 100) / 100 : null;

  let totalPerGuest = null;
  if (foodPerServing !== null && winePerServing !== null) {
    totalPerGuest = Math.round((foodPerServing + winePerServing) * 100) / 100;
  } else if (foodPerServing !== null) {
    totalPerGuest = foodPerServing;
  } else if (winePerServing !== null) {
    totalPerGuest = winePerServing;
  }

  return {
    pricedCount,
    totalIngredients: ingredients.length,
    foodTotal,
    foodPerServing,
    winePrice: winePrice !== null ? Number(winePrice) : null,
    winePerServing,
    totalPerGuest,
  };
}

export function extractTopPantryTerms(recipes = [], limit = 8) {
  const counts = new Map();
  for (const r of recipes) {
    if (r.is_subrecipe) continue;
    const seenInRecipe = new Set();
    for (const ing of r.ingredients || []) {
      const raw = String(ing.name || "").trim().toLowerCase();
      const head = raw.split(/\s+de\s+|\s+/)[0]?.replace(/[^a-záéíóúñü]/gi, "") || "";
      if (head.length < 4 || STOPWORDS_ES.has(head) || head === "agua" || head === "sal") continue;
      if (!seenInRecipe.has(head)) {
        seenInRecipe.add(head);
        counts.set(head, (counts.get(head) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, limit)
    .map(([term]) => term);
}
