# MultiCrop — Social-Media Batch Cropper (Design)

**Date:** 2026-06-03
**Status:** Approved (pending written-spec review)

## Goal

A small browser demo built on the CE.SDK Photo Editor starter kit that lets a
user:

1. Upload an image.
2. Pick one or more social-media sizes from a checkbox list (Facebook Feed,
   Instagram Story, …).
3. Click **Generate** → a spinner shows while cropped versions are produced in
   the background.
4. See a gallery of the generated crops.
5. Hover a crop → an **Edit** button appears.
6. Click **Edit** → a crop-only editor opens in a **modal overlay** (the user
   never leaves the page).
7. Re-frame the crop. The **whole original image** stays available; the crop
   rectangle is **locked to the preset size** (pan/scale the image only).
8. Click **Save** → the modal closes and the updated crop replaces the old one
   in the gallery.
9. Click **Download all** → all crops download as a single ZIP.

### Out of scope

- No persistence — reload starts fresh.
- No tests (this is a demo).
- No background removal *as an editor feature* (the bg-removal model is still
  used internally for saliency — see below).

## Architecture

Two CE.SDK engines with a clean split of responsibilities, plus a plain
vanilla-TS app shell. Stays consistent with the existing vanilla TS + Vite
starter kit — no UI framework added.

### Renderer — headless `@cesdk/engine` `CreativeEngine` (no UI)

The renderer is effectively a stateless image producer:

- `computeFocalPoint(imageBlob)` — run once per uploaded image (cached).
- `buildSceneForPreset(imageURI, preset, focalPoint)` — build a **single-page
  photo scene** (page sized to the preset; the image is the page's croppable
  fill in **Cover** mode; initial framing set from the focal point), then
  `scene.saveToString()`.
- `renderScene(sceneString)` — export the scene's page to a PNG `Blob`.

Used for initial generation, re-renders after an edit, and download-all.

### Editor — one hidden `CreativeEditorSDK` (crop-only), shown in a modal

- Instantiated **once at app startup** and kept hidden inside a modal overlay
  container. Because it is pre-initialized, opening is instant — this satisfies
  "the editor should not load every time the user clicks edit; held in the
  background."
- Built from a **stripped-down** version of the `photo-editor/` config: every
  feature disabled except `ly.img.crop`; dock, navigation bar, inspector bar,
  canvas menu, and panels removed/hidden. The result is just the canvas with the
  crop rectangle over the original image — no panel, no dock, no gizmos.
- **Save** and **Cancel** are our own DOM buttons rendered in the modal chrome
  (not CE.SDK UI components).

### App shell — vanilla TS / DOM

Upload control, social-size checkbox list, **Generate** button, results gallery
(hover → Edit), spinner, **Download all** button, and the modal overlay that
hosts the editor.

## Canonical state

```ts
interface CropResult {
  id: string;          // stable id (preset id)
  presetLabel: string; // e.g. "Instagram Story"
  width: number;
  height: number;
  sceneString: string; // serialized single-page photo scene (source of truth)
  thumbnailUrl: string;// object URL of the latest rendered PNG
}
```

State lives in memory only:

- `sourceImageURI` — the uploaded image, staged as a `buffer://` URI on the
  renderer engine (survives object-URL revocation), plus natural dimensions.
- `focalPoint` — computed once, cached.
- `results: CropResult[]` — one entry per selected preset.

**There is one scene per preset.** No multi-page scene exists anywhere. This is
required because the photo editor's crop tool operates on the *page*
(`engine.block.select(page); setEditMode('Crop')`) with single-page settings;
multiple pages in one scene would break crop behavior and would show the other
versions in the editor.

## Modules

- `src/index.ts` — entry point (repurposed); wires everything, owns app state.
- `src/app/presets.ts` — load social-media presets from `PagePresetsAssetSource`
  (asset source `ly.img.page.presets`), grouped via `asset.groups`, dims from
  `payload.transformPreset`. **Adapted from** `multicrop-demo-1`'s
  `multicrop/presets.ts`, filtered to social groups only (instagram, facebook,
  tiktok, youtube, linkedin, x, pinterest).
- `src/app/saliency.ts` — focal-point computation. **Reused as-is** from
  `multicrop-demo-1`'s `multicrop/saliency.ts` (bg-removal alpha centroid +
  upward head bias; engine-independent given a blob).
- `src/app/renderer.ts` — owns the headless engine; scene building, focal
  framing (adapted from `multicrop-demo-1`'s `crop.ts` cover/position math),
  rendering.
- `src/app/editor.ts` — owns the hidden crop-only `CreativeEditorSDK`;
  `open(result)`, `save()`, `cancel()`.
- `src/app/editor-config.ts` — the stripped photo-editor config (crop-only).
- `src/app/ui.ts` — DOM for upload, checkbox list, gallery, spinner, modal,
  download-all.
- `src/app/download.ts` — ZIP all rendered PNGs (client-side zip lib) → one
  download.

The existing `photo-editor/` folder remains as the reference config the
crop-only editor is derived from.

## Data flow per action

- **Generate**: stage upload as `buffer://`; compute focal point; for each
  selected preset build a single-page scene + render PNG → push `CropResult`;
  hide spinner; render gallery.
- **Edit(i)**: show modal; editor `loadFromString(results[i].sceneString)`;
  select page; `setEditMode('Crop')`; crop frame locked to preset (page fixed
  size, crop size/aspect controls disabled) so only pan/scale of the full image
  is possible.
- **Save**: `saveToString()` → `results[i].sceneString`; renderer re-renders →
  revoke old `thumbnailUrl`, set new; close modal; update that gallery tile.
- **Cancel**: close modal, discard (no scene write).
- **Download all**: renderer renders every `sceneString` → ZIP → download.

## Key technical risk

Getting the exact block structure so the **page-level crop tool engages and
exposes the whole original image**: page-as-image + Cover fill, with the initial
framing applied via the fill's crop transform derived from the focal point.
`multicrop-demo-1` deliberately used a different (child graphic-block) structure
for its drag-to-move approach, so the page-as-image crop behavior must be
verified empirically early in implementation before the rest is built on it.

## Dependencies

- Existing: `@cesdk/cesdk-js`, `@cesdk/engine`, `@imgly/background-removal`,
  `onnxruntime-web` (the last two power saliency only).
- New: a small client-side ZIP library (e.g. `client-zip`) for **Download all**.

## Initial crop default

Centered **Cover** fit, biased to the saliency focal point (reusing the existing
calculation). The user re-positions in the editor.
