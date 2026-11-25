// ============================================================================
// Mise en Place MD — Domain Constants & SVG Iconography
// ============================================================================

export const ICONS = {
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
  chevronLeft: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRightLg: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  menu: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/></svg>`,
  zap: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>`,
  sun: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  compare: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M12 2v20"/></svg>`,
};

// Canonical Vinum Pulse culinary section order (+ Atelier bases/bakery)
export const CANONICAL_CATEGORY_ORDER = [
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

export const WINE_TYPE_ES = {
  Red: "Tinto",
  White: "Blanco",
  Sparkling: "Espumoso",
  Fortified: "Generoso",
  Rose: "Rosado",
};

export const RESOLUTION_SOURCE_ES = {
  linked_dish: "Plato vinculado",
  sensory_profile: "Perfil sensorial",
  tag_affinity: "Afinidad culinaria",
  fallback: "Selección bodega",
};
