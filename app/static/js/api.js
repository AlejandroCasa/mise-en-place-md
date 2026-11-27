// ============================================================================
// Mise en Place MD — REST API Client
// ============================================================================

import { buildRecipeQueryParams } from "./state.js";

export async function fetchRecipes(filters = {}, { signal } = {}) {
  const qs = buildRecipeQueryParams(filters).toString();
  const url = qs ? `/api/recipes?${qs}` : "/api/recipes";
  return fetch(url, { signal });
}

export async function fetchBootstrapData() {
  const [recipesRes, utensilsRes] = await Promise.all([
    fetch("/api/recipes"),
    fetch("/api/utensils"),
  ]);
  if (!recipesRes.ok || !utensilsRes.ok) {
    throw new Error("API bootstrap failed");
  }
  return {
    recipes: await recipesRes.json(),
    utensils: await utensilsRes.json(),
  };
}

export async function fetchWineSuggestion(recipeId) {
  return fetch(`/api/recipes/${encodeURIComponent(recipeId)}/wine-suggestion`);
}

export async function saveRecipePayload(recipe, originalId = null) {
  const url = originalId
    ? `/api/recipes/${encodeURIComponent(originalId)}`
    : "/api/recipes";
  const method = originalId ? "PUT" : "POST";
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recipe),
  });
}

export async function deleteRecipeById(recipeId) {
  return fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: "DELETE",
  });
}

export async function fetchRecipeMarkdown(recipeId) {
  return fetch(`/api/recipes/${encodeURIComponent(recipeId)}/markdown`);
}

export async function saveRecipeMarkdown(recipeId, content) {
  return fetch(`/api/recipes/${encodeURIComponent(recipeId)}/markdown`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function fetchUtensils() {
  return fetch("/api/utensils");
}

export async function saveUtensilsCatalog(utensils) {
  return fetch("/api/utensils", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(utensils),
  });
}

export async function createCatalogUtensil(utensil) {
  return fetch("/api/utensils", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(utensil),
  });
}

export async function uploadMediaFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  return fetch("/api/upload", { method: "POST", body: formData });
}

export async function fetchCellarBottles() {
  return fetch("/api/cellar/bottles");
}

export async function fetchRecipesForCellarBottle(wineSlug) {
  return fetch(`/api/cellar/bottles/${encodeURIComponent(wineSlug)}/recipes`);
}

export async function buildMenuPlan(courses, serviceTime) {
  return fetch("/api/menu-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courses, service_time: serviceTime }),
  });
}

export async function quickCaptureRecipe(rawText, category = "Principal", save = false) {
  return fetch("/api/recipes/quick-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText, category, save }),
  });
}
