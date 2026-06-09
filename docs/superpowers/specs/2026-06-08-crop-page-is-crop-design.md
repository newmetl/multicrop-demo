# Crop editor: "page-is-the-crop" model (match the photo-editor starter kit)

Date: 2026-06-08
Status: approved (brainstormed + investigated via a parallel Workflow; user
confirmed the target behavior with side-by-side screenshots and approved the
corrected design).

## Goal

Make the crop editor behave like the CE.SDK **photo-editor starter kit** crop
tool. Concretely, the two symptoms the user reported (with screenshots):

1. **Resize re-centers.** After resizing the crop rectangle it must end up
   **centered** in the view. Today it stays where the saliency placed it
   (often hugging an edge) and never re-centers.
2. **No bare page.** The dimmed image must fill the canvas; the **grey page must
   never be visible**. Today, dragging/resizing exposes the page underneath.

Target behavior = the starter-kit crop tool: a **resizable** crop rectangle
(aspect locked to the preset), centered, with the dimmed image filling the
canvas and the image always covering the frame (drag pans the image under it;
it can never expose emptiness).

## Root cause

Each preset scene is built (in `src/app/scene.ts`) as an **image-sized page**
holding a **preset-aspect crop block that is a sub-rectangle** of that page
(`computeCropRect` + `coverCropRectToPage`). This inverts CE.SDK's native crop
semantics, which assume the frame being cropped *is* the visible region:

- **Not centered:** the crop block is positioned at the saliency focal point
  (often flush to an edge); `fitPage` centers the *whole image-sized page*, not
  the crop sub-window. Resizing a handle moves the frame edges in place; nothing
  re-centers it.
- **Bare page on drag/resize:** the visible area (image-sized page) is *larger*
  than the crop frame. The coverage clamp only guarantees the image covers the
  *frame*, so any slip/resize slides the 1:1 fill off the zero-slack axis and the
  page outside the frame shows through. `coverCropRectToPage` is also computed
  once at build, so it goes stale after a handle resize.

The starter kit has neither symptom because its **page *is* the image** (image
as the page's content fill); the crop frame is the centered page and there is no
larger page to expose.

## Design: flip to "page is the crop"

Per preset, build the scene the starter-kit way:

- **`src/app/scene.ts` (rewrite).**
  - Page sized to the **preset** (`preset.width × preset.height`), clipped.
  - Source image as the **page's content fill**
    (`createFill('//ly.img.ubq/fill/image')` → `setFill(page, fill)`).
  - Frame the focal region with the proven primitives, applied to the page fill:
    `forceLoadResources([page])` → `setContentFillMode('Cover')` → read
    `getCropScaleX/Y` (`sx,sy`) → `setContentFillMode('Crop')` →
    `setCropTranslationX = -(sx-1)·fx`, `…Y = -(sy-1)·fy` where `(fx,fy)` is the
    focal fraction in `[0,1]` (keeps coverage valid, no clamp).
  - **Delete** `computeCropRect`. Keep aspect locked to the preset (so a resize
    stays the preset ratio); the lock mechanism (`setCropAspectRatioLocked` on
    the cropped block, or page-aspect) is finalized during live tuning.
  - **Fallback** if cropping the *page* fill misbehaves: an equivalent full-page
    image **graphic block** sized to the page (frame == page), cropped with the
    same primitives. Identical user-facing behavior; same APIs the current code
    already proves work.
- **`src/app/renderer.ts`.** `findCropBlock` → return the **page**
  (`findByType('page')[0]`) (or the full-page child in the fallback).
  `export(block, { targetWidth: preset.w, targetHeight: preset.h })` is now an
  exact, non-distorting resize. Mutex/flow unchanged.
- **`src/app/editor.ts`.** Select & crop the **page** (or full-page child).
  Keep the `enterCropMode` guard — its original "hide the bare oversized page"
  rationale is gone, but it still holds Crop mode against the first-mount reset
  (the stripped UI has no crop button); update its comment. `fitPage` now centers
  the preset-sized page = the crop. `save`/`hide` (incl. the stale-block fix)
  unchanged.
- **`src/app/crop-editor-config.ts`.** Add the missing enabler
  `page/allowCropInteraction = true`; keep `dimOutOfPageAreas` +
  `highlightWhenCropping`; **keep the crop rectangle resizable** (crop handles
  on, aspect locked to the preset). Re-center after a resize: if the native
  page-as-image behavior doesn't auto-center, re-run the page zoom-fit on
  crop-state change. Exact gizmo/interaction settings are tuned **live** against
  the starter kit.

**Untouched:** `state.ts`, `index.ts`, `download.ts`, `saliency.ts`,
`presets.ts`. `CropResult.sceneString` is an opaque boundary; width/height stay
preset-driven; thumbnails are re-renders.

## Compatibility

In-session crops built with the old model become stale (editor/renderer now
expect page-as-crop). There is **no persistence** (reload = fresh), so the cut
is clean — just regenerate. No migration code.

## Verification

- `npm run check:syntax` (the only automated gate).
- **Live, against the starter kit** (the app cold-starts in the preview now):
  drive sample → generate → edit → resize + drag, screenshot, and confirm the
  crop is **resizable, centered after resize, and never exposes the grey page**,
  matching the starter-kit screenshot. Iterate on the crop settings until it
  matches; capture before/after.

## Out of scope (YAGNI)

The native crop inspector panel (aspect picker / rotate / flip) — the editor
stays minimal/canvas-only per the user's choice; resizable-and-centered does not
need it. No change to saliency, generation, download, or state model.
