# Atelier Culinario (`mise-en-place-md`) — Interface Design System

## Direction & Feel ("Acero & Mesa de Pase")
- **Design Read**: Laboratorio culinario sobre encimera de acero inoxidable cepillado, báscula digital de precisión y llama azul de fogón; contraste térmico directo frente al pergamino cálido de bodega de **Vinum Pulse**.
- **Control Dials**: `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 4`, `VISUAL_DENSITY: 7`.
- **Mode**: `Operate` (precision, scannability, zero decorative clutter).

## Surface & Color Tokens (`app/static/styles.css`)
- **Canvas / Surfaces (cool mineral steel, whisper-quiet lightness shifts)**:
  - `--steel-canvas: #f1f4f6` (app shell, header, left rail, recessed sub-blocks)
  - `--pass-surface: #ffffff` (active recipe technical sheet, modals, selected rail row)
  - `--recessed-well: #e6ebee` (inputs, search bar, chips)
  - `--graphite-panel: #11161a` (primary ink, Vernier scaling instrument, timers dock, raw MD editor)
- **Ink Hierarchy (4 tiers)**: `--ink-primary (#11161a)`, `--ink-secondary (#424f59)`, `--ink-tertiary (#60707c)`, `--ink-muted (#84939e)`.
- **Accents**:
  - Culinary primary (gas-flame blue): `--flame-blue: #1b56a8` (hover `#144282`, tint `rgba(27, 86, 168, 0.075)`).
  - Thermal probe / PCC: `--thermal-red: #c43b2b` (temperatures, critical control points, missing equipment).
  - Ready state: `--ready-green: #1e6b48`.
  - Enology bridge (scoped strictly to Vinum Pulse portal): `--vinum-burgundy: #6b1d2b` (tint `rgba(107, 29, 43, 0.045)`).
- **Depth Strategy**: Hairline borders (`rgba(17, 22, 26, 0.06 / 0.11 / 0.20)`) + tonal surface shifts. Shadows reserved exclusively for floating layers (`.modal-dialog`, `.timer-card`).

## Typography & Spacing
- **Font Triad**: `Newsreader` (editorial serif headings, `-0.025em` tracking, `text-wrap: balance`) · `Plus Jakarta Sans` (body/instructions, `65ch` max measure) · `JetBrains Mono` (`tabular-nums` for weights, baker's %, temperatures, timings, countdowns).
- **Spacing Base Unit**: `4px` (`4, 8, 12, 16, 20, 24, 32, 40`).
- **Proportions**: Sticky header `56px` · Left index rail `348px` on desktop · Asymmetric detail body `5fr / 8fr`.

## Key Component Patterns
- **Buttons**: `34px` height (`28px` `.btn-sm`), `6px` radius, `transform: scale(0.97)` on `:active` (`140ms cubic-bezier(0.23, 1, 0.32, 1)`), hover gated by `@media (hover: hover) and (pointer: fine)`.
- **Telemetry Strip (`.telemetry-strip`)**: 4-column hairline-divided specification bar (Mise en place, Cocción activa, Reposo/Ferm., Tiempo total).
- **Vinum Pulse Strip (`.vinum-strip`)**: Burgundy-tinted hairline portal contrasting sharply against the cool steel sheet, rendering live `GET /api/recipes/{id}/wine-suggestion`.
- **Vernier Scaler (`.scaler-instrument`)**: Graphite instrument bar with `Raciones | % Panadero` segmented toggle and `0.5x–3x` presets.
- **Iconography**: Unified authored `1.65px`-stroke inline SVG icons (`ICONS` map in `app/static/app.js`). Zero emojis.
