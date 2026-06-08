# MultiCrop — IMG.LY-style redesign (spec)

Date: 2026-06-08
Status: approved (brainstormed with the visual companion; user approved the
near-final mockup and said "implement this")

## Goal

Bring the demo's look closer to the IMG.LY design language and make it feel
polished. Two explicit asks from the user:

1. Make it pretty, closer to the IMG.LY default editor design.
2. Make the size presets look like the **page-sizes panel** of the
   `starterkit-page-sizes-asset-source-ts-web` reference — i.e. cards with a
   proportional aspect-ratio preview rectangle, a name, and the pixel
   dimensions.

Plus two refinements decided during brainstorming:

3. The body content sits in a **centered, capped-width column**.
4. The preset cards are **fixed-width** (wrap + left-align, no stretching), and
   the column is wide enough that **four cards fit on one row**.

This is a visual/markup restyle. **No change to the app's flow, engine logic,
crop math, state model, or the renderer.** Same panels, same IDs the
orchestrator wires, same checkbox-based selection query.

## Decisions (from the companion)

- **Theme:** Light (IMG.LY default), not the current dark.
- **Layout:** Stacked flow (top bar → upload → choose sizes → generate →
  gallery), restyled — not a two-pane editor layout.
- **Preset selection:** the whole card is a toggle (page-sizes-panel style),
  multi-select, with a blue ring + checkmark badge + soft-blue preview when
  selected.

## Design tokens (light)

```
--bg:#eef0f3  --surface:#fff  --surface-2:#f1f3f6  --stage:#f7f8fa
--border:#e4e6ec  --border-strong:#d7dbe3
--text:#1a1d24  --muted:#6b7280
--accent:#2f6bff  --accent-hover:#2559e0  --accent-soft:#eaf0ff
--danger:#b91c1c
radius: 12px panels, 10px cards, 8px buttons, 7px previews
shadow-sm: 0 1px 2px rgba(20,24,40,.04)
font: system-ui / -apple-system
--maxw: 720px  (fits exactly four 148px cards + gaps within panel/body padding)
```

## Layout / components

- **Top bar** (full-bleed white, bottom border; inner content capped to
  `--maxw`, centered): gradient logo mark (scissors glyph) + "MultiCrop" title +
  tagline "Crop one image to every social size at once".
- **Body**: centered `max-width:--maxw` column, vertical stack of panels.
- **Upload panel** (one row):
  - Empty state: placeholder thumb hidden, name "No image selected", sub
    "PNG, JPG or WebP", button "Upload image".
  - Filled state: rounded thumbnail (the session blob URL), filename, sub line
    `W × H · <size>`, button relabeled "Replace image".
- **Choose sizes panel**: head "Choose sizes" + a soft-blue "N selected" count
  pill. Per platform group: muted uppercase label with the brand glyph, then a
  fixed-width card grid (`repeat(auto-fill, 148px)`, `justify-content:start`).
  - **Card** = `<label>` wrapping a visually-hidden `<input type=checkbox
    data-preset-checkbox>` + visuals: soft preview tile holding a proportional
    aspect-ratio rectangle (longest side → 36px, min 8px), preset name, and
    `W × H`. Selected styling via `.size-card:has(input:checked)` (ring +
    checkmark + soft-blue preview). Keeping the hidden checkbox means
    `selectedPresetIds()` and `wireSelectionToGenerate()` are unchanged.
- **Generate bar**: primary accent button (label stays "Generate"), live status
  area (`#generate-status`) for the spinner / note.
- **Results panel**: head "Generated crops", right-aligned subtle "Delete all"
  + accent "Download all (.zip)". Gallery = fixed-width tiles
  (`repeat(auto-fill, 150px)`), each: neutral stage with the proportionally
  sized thumbnail, hover overlay with a white "Edit" pill, top-right ✕ delete,
  caption `<b>label</b> · W×H`. Logic/handlers unchanged.
- **Editor modal**: white top bar (title left, Cancel ghost + Save accent
  right), CE.SDK canvas below. Set the CE.SDK editor `theme:'light'` so the
  canvas matches.
- **Loading overlay**: light bg, accent spinner.

## Files touched

- `index.html` — replace the `<style>` block (new tokens + component styles) and
  restructure the body markup (top bar, upload row, panel heads, modal). Keep
  every id the orchestrator/ui wire.
- `src/app/ui.ts` — render preset **cards** (label + hidden checkbox + rect)
  instead of text checkboxes; add a `formatBytes` helper + selected-count
  update; restyle gallery tile markup/classes; extend `setUploadedImage` to take
  `width,height,sizeBytes` for the sub line and relabel the button.
- `src/index.ts` — pass `width,height,file.size` into `setUploadedImage`
  (values already computed at upload time).
- `src/app/editor.ts` — add `theme:'light'` to `CreativeEditorSDK.create`.

No changes to `presets.ts`, `state.ts`, `scene.ts`, `renderer.ts`,
`download.ts`, `saliency.ts`.

## Verification

- `npm run check:syntax` (the only automated gate).
- Browser via the preview tool: light theme renders; four Instagram cards on one
  row; selecting cards shows the ring/checkmark and updates the count + Generate
  enabled state; generate produces gallery tiles with hover Edit + delete; Edit
  opens the light editor modal; layout is centered/capped.

## Out of scope (YAGNI)

Drag-and-drop upload, responsive breakpoints beyond natural wrapping, changing
the generation/crop behavior, persistence, or the two-pane editor layout.
