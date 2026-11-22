// ============================================================================
// Mise en Place MD — Full Recipe Editor (Create / Edit / Duplicate)
// ============================================================================

import * as api from "./api.js";
import { ICONS } from "./constants.js";
import { escapeHtml, state } from "./state.js";
import { renderEmptyState, renderRecipeDetail } from "./views.js";

export function openRecipeEditor(recipeId = null) {
  state.editingOriginalId = recipeId;
  if (recipeId) {
    const existing = state.allRecipes.find((r) => r.id === recipeId);
    state.editingDraft = structuredClone(existing);
  } else {
    state.editingDraft = {
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
        {
          name: "",
          amount: 100,
          unit: "g",
          group: "Principal",
          is_base_weight: true,
          notes: "",
        },
      ],
      steps: [
        {
          order: 1,
          title: "",
          instruction: "",
          duration_minutes: null,
          temp_c: null,
          critical_point: "",
          photo: "",
        },
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

export function syncDraftScalarsFromDOM() {
  if (!state.editingDraft) return;
  const val = (id) => document.getElementById(id)?.value ?? "";
  state.editingDraft.title = val("ed-title");
  state.editingDraft.subtitle = val("ed-subtitle");
  state.editingDraft.category = val("ed-category") || "Principal";
  state.editingDraft.is_subrecipe =
    document.getElementById("ed-is-subrecipe")?.checked || false;
  state.editingDraft.difficulty = parseInt(val("ed-difficulty") || "3", 10);
  state.editingDraft.rating = parseFloat(val("ed-rating") || "0");
  state.editingDraft.servings = parseFloat(val("ed-servings") || "4") || 1;
  state.editingDraft.yield_unit = val("ed-yield-unit") || "raciones";
  state.editingDraft.scaling_mode = val("ed-scaling-mode") || "servings";
  state.editingDraft.cover_photo = val("ed-cover-photo");

  state.editingDraft.techniques = val("ed-techniques")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  state.editingDraft.tags = val("ed-tags")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  state.editingDraft.timings = {
    prep_minutes: parseInt(val("ed-prep-min") || "0", 10) || 0,
    cook_minutes: parseInt(val("ed-cook-min") || "0", 10) || 0,
    rest_minutes: parseInt(val("ed-rest-min") || "0", 10) || 0,
    rest_notes: val("ed-rest-notes"),
  };

  state.editingDraft.plating_notes = val("ed-plating-notes");
  state.editingDraft.chef_notes = val("ed-chef-notes");
}

export function renderRecipeEditor() {
  const container = document.getElementById("recipe-detail-container");
  if (!container || !state.editingDraft) return;

  const d = state.editingDraft;
  const otherRecipes = state.allRecipes.filter(
    (r) => r.id !== state.editingOriginalId
  );

  container.innerHTML = `
    <div class="editor-shell">
      <div class="sheet-toolbar">
        <div>
          <h1 class="sheet-title" style="font-size: 26px;">
            ${state.editingOriginalId ? `Editar: ${escapeHtml(d.title)}` : "Nueva Ficha Técnica"}
          </h1>
          <p style="font-size: 12.5px; color: var(--ink-tertiary); margin-top: 2px;">
            Persistido en PostgreSQL (<code class="font-mono">culinary.recipes</code>) con exportación Markdown/YAML.
          </p>
        </div>
        <div class="sheet-actions">
          <button type="button" data-action="cancel-editor" class="btn btn-secondary">Cancelar</button>
          <button type="button" data-action="save-editor" class="btn btn-accent">Guardar receta</button>
        </div>
      </div>

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
                <input type="file" accept="image/*" class="is-hidden" data-change-action="upload-cover-photo" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Utensilios y Equipamiento</h2>
          <div class="sheet-actions">
            <select id="ed-add-utensil-select" class="control-select" style="width: auto;">
              <option value="">Seleccionar de catálogo...</option>
              ${state.utensilsCatalog
                .map(
                  (u) =>
                    `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} (${escapeHtml(u.category)})</option>`
                )
                .join("")}
            </select>
            <button type="button" data-action="editor-add-utensil-catalog" class="btn btn-secondary btn-sm">Añadir</button>
            <button type="button" data-action="editor-add-utensil-custom" class="btn btn-ghost btn-sm">Nuevo libre</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(d.utensils || [])
            .map(
              (u, idx) => `
            <div class="editor-row-box editor-grid-12" style="align-items: center;">
              <div class="col-4">
                <input type="text" value="${escapeHtml(u.name)}" data-editor-collection="utensils" data-index="${idx}" data-field="name" data-kind="string" placeholder="Utensilio" class="control-input" />
              </div>
              <div class="col-3">
                <select data-editor-collection="utensils" data-index="${idx}" data-field="mandatory" data-kind="boolean" data-rerender="true" class="control-select font-mono">
                  <option value="true" ${u.mandatory ? "selected" : ""}>Obligatorio</option>
                  <option value="false" ${!u.mandatory ? "selected" : ""}>Opcional</option>
                </select>
              </div>
              <div class="col-4">
                <input type="text" value="${escapeHtml(u.notes || "")}" data-editor-collection="utensils" data-index="${idx}" data-field="notes" data-kind="string" placeholder="Uso técnico o sustituto" class="control-input" />
              </div>
              <div class="col-1" style="text-align: right;">
                <button type="button" data-action="editor-remove-row" data-editor-collection="utensils" data-index="${idx}" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Tiempos y Temperaturas</h2>
          <button type="button" data-action="editor-add-temperature" class="btn btn-secondary btn-sm">
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
              <input type="text" value="${escapeHtml(tp.stage)}" data-editor-collection="temperatures" data-index="${idx}" data-field="stage" data-kind="string" placeholder="Fase (ej. Sonda al corazón)" class="control-input" />
            </div>
            <div class="col-2">
              <input type="number" step="0.5" value="${tp.temp_c}" data-editor-collection="temperatures" data-index="${idx}" data-field="temp_c" data-kind="float0" class="control-input font-mono" />
            </div>
            <div class="col-4">
              <input type="text" value="${escapeHtml(tp.notes || "")}" data-editor-collection="temperatures" data-index="${idx}" data-field="notes" data-kind="string" placeholder="Notas térmicas" class="control-input" />
            </div>
            <div class="col-1" style="text-align: right;">
              <button type="button" data-action="editor-remove-row" data-editor-collection="temperatures" data-index="${idx}" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
            </div>
          </div>
        `
          )
          .join("")}
      </section>

      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Escandallo de Ingredientes</h2>
          <button type="button" data-action="editor-add-ingredient" class="btn btn-secondary btn-sm">
            ${ICONS.plus} <span>Ingrediente</span>
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(d.ingredients || [])
            .map(
              (ing, idx) => `
            <div class="editor-row-box editor-grid-12" style="align-items: center;">
              <div class="col-3">
                <input type="text" value="${escapeHtml(ing.name)}" data-editor-collection="ingredients" data-index="${idx}" data-field="name" data-kind="string" placeholder="Ingrediente" class="control-input" />
              </div>
              <div class="col-2" style="display: flex; gap: 4px;">
                <input type="number" step="any" value="${ing.amount ?? ""}" data-editor-collection="ingredients" data-index="${idx}" data-field="amount" data-kind="nullable-float" placeholder="Cant." class="control-input font-mono" />
                <input type="text" value="${escapeHtml(ing.unit || "g")}" data-editor-collection="ingredients" data-index="${idx}" data-field="unit" data-kind="string" placeholder="g" class="control-input font-mono" style="width: 56px;" />
              </div>
              <div class="col-2">
                <input type="text" value="${escapeHtml(ing.group || "Principal")}" data-editor-collection="ingredients" data-index="${idx}" data-field="group" data-kind="string" placeholder="Grupo" class="control-input" />
              </div>
              <div class="col-3">
                <input type="text" value="${escapeHtml(ing.notes || "")}" data-editor-collection="ingredients" data-index="${idx}" data-field="notes" data-kind="string" placeholder="Corte / nota" class="control-input" />
              </div>
              <div class="col-2" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <label class="font-mono" style="font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;" title="Base 100%">
                  <input type="checkbox" ${ing.is_base_weight ? "checked" : ""} data-editor-collection="ingredients" data-index="${idx}" data-field="is_base_weight" data-kind="checkbox" style="accent-color: var(--flame-blue);" />
                  <span>100%</span>
                </label>
                <button type="button" data-action="editor-remove-row" data-editor-collection="ingredients" data-index="${idx}" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
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
            <button type="button" data-action="editor-add-subrecipe" class="btn btn-secondary btn-sm">Vincular</button>
          </div>
        </div>

        ${(d.subrecipes || [])
          .map(
            (sr, idx) => `
          <div class="editor-row-box editor-grid-12" style="align-items: center;">
            <div class="col-4" style="font-size: 13px; font-weight: 600;">${escapeHtml(sr.name)}</div>
            <div class="col-3" style="display: flex; gap: 4px;">
              <input type="number" step="any" value="${sr.amount ?? ""}" data-editor-collection="subrecipes" data-index="${idx}" data-field="amount" data-kind="nullable-float" placeholder="Cant." class="control-input font-mono" />
              <input type="text" value="${escapeHtml(sr.unit || "ml")}" data-editor-collection="subrecipes" data-index="${idx}" data-field="unit" data-kind="string" class="control-input font-mono" style="width: 60px;" />
            </div>
            <div class="col-4">
              <input type="text" value="${escapeHtml(sr.notes || "")}" data-editor-collection="subrecipes" data-index="${idx}" data-field="notes" data-kind="string" placeholder="Aplicación" class="control-input" />
            </div>
            <div class="col-1" style="text-align: right;">
              <button type="button" data-action="editor-remove-row" data-editor-collection="subrecipes" data-index="${idx}" class="btn btn-danger-ghost btn-sm" aria-label="Quitar">${ICONS.close}</button>
            </div>
          </div>
        `
          )
          .join("")}
      </section>

      <section class="editor-section">
        <div class="sheet-toolbar">
          <h2 class="section-heading">Procedimiento</h2>
          <button type="button" data-action="editor-add-step" class="btn btn-secondary btn-sm">
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
                  <input type="text" value="${escapeHtml(st.title || "")}" data-editor-collection="steps" data-index="${idx}" data-field="title" data-kind="string" placeholder="Título del paso" class="control-input" />
                </div>
                <div class="col-2">
                  <input type="number" min="0" value="${st.duration_minutes ?? ""}" data-editor-collection="steps" data-index="${idx}" data-field="duration_minutes" data-kind="nullable-int" placeholder="Min" class="control-input font-mono" />
                </div>
                <div class="col-2">
                  <input type="number" step="0.5" value="${st.temp_c ?? ""}" data-editor-collection="steps" data-index="${idx}" data-field="temp_c" data-kind="nullable-float" placeholder="°C" class="control-input font-mono" />
                </div>
                <div class="col-2" style="text-align: right;">
                  <button type="button" data-action="editor-remove-row" data-editor-collection="steps" data-index="${idx}" class="btn btn-danger-ghost btn-sm">Eliminar</button>
                </div>
              </div>
              <textarea rows="2" data-editor-collection="steps" data-index="${idx}" data-field="instruction" data-kind="string" placeholder="Instrucción técnica..." class="control-textarea">${escapeHtml(st.instruction || "")}</textarea>
              <div class="editor-grid-12">
                <div class="col-8">
                  <input type="text" value="${escapeHtml(st.critical_point || "")}" data-editor-collection="steps" data-index="${idx}" data-field="critical_point" data-kind="string" placeholder="Punto Crítico de Control (PCC)" class="control-input" />
                </div>
                <div class="col-4" style="display: flex; gap: 6px;">
                  <input type="text" value="${escapeHtml(st.photo || "")}" data-editor-collection="steps" data-index="${idx}" data-field="photo" data-kind="string" placeholder="URL foto" class="control-input font-mono" />
                  <label class="btn btn-secondary btn-sm" style="cursor: pointer; height: 33px;">
                    ${ICONS.upload}
                    <input type="file" accept="image/*" class="is-hidden" data-change-action="upload-step-photo" data-index="${idx}" />
                  </label>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </section>

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
        <button type="button" data-action="cancel-editor" class="btn btn-secondary">Cancelar</button>
        <button type="button" data-action="save-editor" class="btn btn-accent">Guardar receta</button>
      </div>
    </div>
  `;
}

export function handleEditorFieldUpdate(target) {
  if (!state.editingDraft) return;
  const collection = target.dataset.editorCollection;
  const idx = parseInt(target.dataset.index || "-1", 10);
  const field = target.dataset.field;
  const kind = target.dataset.kind || "string";
  if (!collection || idx < 0 || !field || !Array.isArray(state.editingDraft[collection])) {
    return;
  }

  const row = state.editingDraft[collection][idx];
  if (!row) return;

  switch (kind) {
    case "boolean":
      row[field] = target.value === "true";
      break;
    case "checkbox":
      row[field] = Boolean(target.checked);
      break;
    case "float0":
      row[field] = parseFloat(target.value) || 0;
      break;
    case "nullable-float":
      row[field] = target.value === "" ? null : parseFloat(target.value);
      break;
    case "nullable-int":
      row[field] = target.value === "" ? null : parseInt(target.value, 10);
      break;
    case "string":
    default:
      row[field] = target.value;
      break;
  }

  if (target.dataset.rerender === "true") {
    syncDraftScalarsFromDOM();
    renderRecipeEditor();
  }
}

export function editorAddUtensilFromCatalog() {
  syncDraftScalarsFromDOM();
  const uId = document.getElementById("ed-add-utensil-select")?.value;
  if (!uId || !state.editingDraft) return;
  const catItem = state.utensilsCatalog.find((u) => u.id === uId);
  if (!catItem) return;
  state.editingDraft.utensils.push({
    utensil_id: catItem.id,
    name: catItem.name,
    mandatory: true,
    notes: "",
  });
  renderRecipeEditor();
}

export function editorAddCustomUtensil() {
  syncDraftScalarsFromDOM();
  if (!state.editingDraft) return;
  state.editingDraft.utensils.push({
    utensil_id: `utensilio-${Date.now()}`,
    name: "",
    mandatory: true,
    notes: "",
  });
  renderRecipeEditor();
}

export function editorAddSubrecipe() {
  syncDraftScalarsFromDOM();
  const rId = document.getElementById("ed-add-subrecipe-select")?.value;
  if (!rId || !state.editingDraft) return;
  const target = state.allRecipes.find((r) => r.id === rId);
  if (!target) return;
  state.editingDraft.subrecipes.push({
    recipe_id: target.id,
    name: target.title,
    amount: target.servings || 250,
    unit: target.yield_unit || "ml",
    notes: "",
  });
  renderRecipeEditor();
}

export function editorAddRow(collection) {
  syncDraftScalarsFromDOM();
  if (!state.editingDraft) return;
  if (collection === "temperatures") {
    state.editingDraft.temperatures.push({ stage: "", temp_c: 100, notes: "" });
  } else if (collection === "ingredients") {
    state.editingDraft.ingredients.push({
      name: "",
      amount: 100,
      unit: "g",
      group: "Principal",
      is_base_weight: false,
      notes: "",
    });
  } else if (collection === "steps") {
    state.editingDraft.steps.push({
      order: state.editingDraft.steps.length + 1,
      title: "",
      instruction: "",
      duration_minutes: null,
      temp_c: null,
      critical_point: "",
      photo: "",
    });
  }
  renderRecipeEditor();
}

export function editorRemoveRow(collection, idx) {
  syncDraftScalarsFromDOM();
  if (!state.editingDraft || !Array.isArray(state.editingDraft[collection])) return;
  state.editingDraft[collection].splice(idx, 1);
  renderRecipeEditor();
}

export async function uploadCoverPhoto(inputEl) {
  if (!inputEl.files || !inputEl.files[0] || !state.editingDraft) return;
  syncDraftScalarsFromDOM();
  const res = await api.uploadMediaFile(inputEl.files[0]);
  if (res.ok) {
    const data = await res.json();
    state.editingDraft.cover_photo = data.url;
    renderRecipeEditor();
  }
}

export async function uploadStepPhoto(inputEl, stepIdx) {
  if (!inputEl.files || !inputEl.files[0] || !state.editingDraft) return;
  syncDraftScalarsFromDOM();
  const res = await api.uploadMediaFile(inputEl.files[0]);
  if (res.ok) {
    const data = await res.json();
    state.editingDraft.steps[stepIdx].photo = data.url;
    renderRecipeEditor();
  }
}

export async function saveRecipeFromEditor(onSaved) {
  syncDraftScalarsFromDOM();
  if (!state.editingDraft || !state.editingDraft.title.trim()) {
    alert("El nombre de la receta es obligatorio.");
    return;
  }

  state.editingDraft.ingredients = (state.editingDraft.ingredients || []).filter(
    (i) => i.name && i.name.trim()
  );
  state.editingDraft.steps = (state.editingDraft.steps || []).filter(
    (s) => (s.instruction && s.instruction.trim()) || (s.title && s.title.trim())
  );
  state.editingDraft.temperatures = (state.editingDraft.temperatures || []).filter(
    (t) => t.stage && t.stage.trim()
  );
  state.editingDraft.utensils = (state.editingDraft.utensils || []).filter(
    (u) => u.name && u.name.trim()
  );

  let catalogChanged = false;
  for (const u of state.editingDraft.utensils) {
    if (!state.utensilsCatalog.some((c) => c.id === u.utensil_id)) {
      state.utensilsCatalog.push({
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
    await api.saveUtensilsCatalog(state.utensilsCatalog);
  }

  const res = await api.saveRecipePayload(
    state.editingDraft,
    state.editingOriginalId
  );

  if (res.ok) {
    const saved = await res.json();
    state.wineSuggestionCache.delete(saved.id);
    state.editingDraft = null;
    state.editingOriginalId = null;
    await onSaved(saved.id);
  } else {
    const errText = await res.text();
    alert("Error al guardar la receta: " + errText);
  }
}

export function cancelRecipeEditor(onSelectRecipe) {
  state.editingDraft = null;
  state.editingOriginalId = null;
  if (state.activeRecipeId) {
    const r = state.allRecipes.find((x) => x.id === state.activeRecipeId);
    if (r) renderRecipeDetail(r);
  } else if (state.allRecipes.length > 0) {
    onSelectRecipe(state.allRecipes[0].id);
  } else {
    renderEmptyState();
  }
}

export async function duplicateRecipe(recipeId, onReload) {
  const orig = state.allRecipes.find((r) => r.id === recipeId);
  if (!orig) return;
  const copy = structuredClone(orig);
  copy.id = "";
  copy.title = `${orig.title} (Variante)`;
  const res = await api.saveRecipePayload(copy, null);
  if (res.ok) {
    const saved = await res.json();
    await onReload(saved.id);
  }
}

export async function confirmDeleteRecipe(recipeId, onReload) {
  const r = state.allRecipes.find((x) => x.id === recipeId);
  if (!r) return;
  if (!confirm(`¿Seguro que quieres eliminar "${r.title}"?`)) return;
  const res = await api.deleteRecipeById(recipeId);
  if (res.ok) {
    state.wineSuggestionCache.delete(recipeId);
    state.activeRecipeId = null;
    window.history.replaceState(null, "", "/");
    await onReload(null);
  }
}
