import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRecipeEquipmentStatus,
  computeScaleFactorFromBaseWeight,
  computeScaleFactorFromServings,
  escapeHtml,
  extractSlugFromPath,
  filterAndSortRecipes,
  formatDuration,
  formatNumber,
  getBaseWeightTotal,
  sortCategoriesCanonical,
} from "../../app/static/js/state.js";
import { createTimerEntry, tickTimers } from "../../app/static/js/timers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "../../app/static");

test("extractSlugFromPath decodes /recipes/{slug} deep links", () => {
  assert.equal(extractSlugFromPath("/recipes/arroz-meloso-pato"), "arroz-meloso-pato");
  assert.equal(extractSlugFromPath("/recipes/pan%20masa%20madre"), "pan masa madre");
  assert.equal(extractSlugFromPath("/"), null);
  assert.equal(extractSlugFromPath("/api/recipes"), null);
});

test("scaling helpers compute accurate factors and reject invalid values", () => {
  assert.equal(computeScaleFactorFromServings("8", 4), 2);
  assert.equal(computeScaleFactorFromServings("0", 4), null);
  assert.equal(computeScaleFactorFromServings("-2", 4), null);

  assert.equal(computeScaleFactorFromBaseWeight("1500", 1000), 1.5);
  assert.equal(computeScaleFactorFromBaseWeight("", 1000), null);

  assert.equal(
    getBaseWeightTotal({
      ingredients: [
        { name: "Harina fuerza", amount: 500, is_base_weight: true },
        { name: "Harina centeno", amount: 100, is_base_weight: true },
        { name: "Agua", amount: 420, is_base_weight: false },
      ],
    }),
    600
  );
  assert.equal(getBaseWeightTotal({ ingredients: [] }), 1000);
});

test("formatting and XSS escaping utilities handle edge cases safely", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(95), "1h 35m");

  assert.equal(formatNumber(2.3456), "2.35");
  assert.equal(formatNumber(null), "");
  assert.equal(escapeHtml(`<script>alert("x'y")</script>`), "&lt;script&gt;alert(&quot;x&#039;y&quot;)&lt;/script&gt;");
});

test("canonical category sorting respects Vinum Pulse culinary section order", () => {
  const sorted = sortCategoriesCanonical(["Postres y Dulces", "Zeta Custom", "Entrantes y Cuchara", "Arroces"]);
  assert.deepEqual(sorted, ["Entrantes y Cuchara", "Arroces", "Postres y Dulces", "Zeta Custom"]);
});

test("filterAndSortRecipes filters by equipment, ingredients, and sorts properly", () => {
  const utensils = [
    { id: "roner", name: "Roner", owned: false },
    { id: "cazo", name: "Cazo", owned: true },
  ];
  const recipes = [
    {
      id: "carrillera",
      title: "Carrillera al vino tinto",
      subtitle: "Cocción lenta",
      category: "Carnes y Caza",
      is_subrecipe: false,
      difficulty: 4,
      rating: 4.9,
      updated_at: "2026-11-18T10:00:00Z",
      timings: { prep_minutes: 20, cook_minutes: 120, rest_minutes: 0 },
      techniques: ["Sous-vide"],
      tags: ["vino tinto"],
      ingredients: [{ name: "Carrillera ibérica", notes: "" }],
      utensils: [{ utensil_id: "roner", name: "Roner", mandatory: true }],
    },
    {
      id: "fondo-oscuro",
      title: "Fondo Oscuro",
      subtitle: "Base técnica",
      category: "Fondo / Base",
      is_subrecipe: true,
      difficulty: 2,
      rating: 4.5,
      updated_at: "2026-11-19T10:00:00Z",
      timings: { prep_minutes: 15, cook_minutes: 180, rest_minutes: 0 },
      techniques: ["Reducción"],
      tags: ["base"],
      ingredients: [{ name: "Huesos de ternera", notes: "" }],
      utensils: [{ utensil_id: "cazo", name: "Cazo", mandatory: true }],
    },
  ];

  assert.equal(checkRecipeEquipmentStatus(recipes[0], utensils).canCookMandatory, false);
  assert.equal(checkRecipeEquipmentStatus(recipes[1], utensils).canCookMandatory, true);

  const cookable = filterAndSortRecipes(recipes, { cookableToday: true }, utensils);
  assert.deepEqual(cookable.map((r) => r.id), ["fondo-oscuro"]);

  const byTitle = filterAndSortRecipes(recipes, { sortBy: "title_asc" }, utensils);
  assert.deepEqual(byTitle.map((r) => r.id), ["carrillera", "fondo-oscuro"]);

  const excluded = filterAndSortRecipes(recipes, { ingExclude: "ternera" }, utensils);
  assert.deepEqual(excluded.map((r) => r.id), ["carrillera"]);
});

test("timers tick down deterministically and signal completion", () => {
  const t1 = createTimerEntry("Reducción", 0.05); // 3 seconds
  assert.equal(t1.remainingSeconds, 3);
  assert.equal(tickTimers([t1]), false);
  assert.equal(tickTimers([t1]), false);
  assert.equal(tickTimers([t1]), true);
  assert.equal(t1.remainingSeconds, 0);

  const paused = createTimerEntry("Reposo", 1);
  paused.paused = true;
  assert.equal(tickTimers([paused]), false);
  assert.equal(paused.remainingSeconds, 60);
});

test("static HTML and ES modules contain zero inline event handler attributes", () => {
  const filesToScan = [
    path.join(STATIC_DIR, "index.html"),
    ...fs
      .readdirSync(path.join(STATIC_DIR, "js"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(STATIC_DIR, "js", f)),
  ];

  const inlineHandlerRegex = /\bon(click|input|change|toggle|submit|keyup|keydown)\s*=/i;
  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, "utf8");
    assert.equal(
      inlineHandlerRegex.test(content),
      false,
      `Inline event handler found in ${path.basename(filePath)}`
    );
  }
  assert.equal(fs.existsSync(path.join(STATIC_DIR, "app.js")), false, "Legacy monolithic app.js should be removed");
});
