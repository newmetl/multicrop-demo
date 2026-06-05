# MultiCrop — project context for Claude

A small browser **demo** (not production) built on the IMG.LY CE.SDK Photo Editor
starter kit. It crops one uploaded image to many social-media sizes at once.

## User flow

1. Upload an image.
2. Tick one or more social-media sizes (grouped by platform).
3. Click **Generate** → a spinner shows while crops are produced headlessly.
4. A gallery of cropped versions appears (saliency-framed cover crops).
5. Hover a tile → **Edit** button → opens a crop-only editor in a modal.
6. Re-frame the crop over the full original image (frame locked to the preset);
   **Save** updates that tile, **Cancel** discards.
7. **Download all** → one ZIP of all crops.

## Run / verify

```bash
npm install        # heavy: CE.SDK + onnxruntime + the bg-removal model
npm run dev        # Vite dev server on http://localhost:5173
npm run check:syntax  # tsc --noEmit — the ONLY automated gate (see below)
```

- **No test suite. Tests are intentionally out of scope** (user decision for this
  demo). Verification = `npm run check:syntax` + manual/browser checks.
- `.claude/launch.json` defines the `multicrop-dev` server for the preview tool.
- Cold start is slow (~60–90s) in throttled/headless preview environments:
  two CE.SDK engines init from CDN + a ~24 MB ONNX model downloads. In a normal
  foreground browser with warm caches it's much faster. This is environmental,
  not a bug.
- No license key is set → exports carry the CE.SDK **trial watermark** (fine for
  a demo). The "IMG.LY [Evaluation Purposes Only]" banner spam in the console is
  expected.

## Architecture

Two CE.SDK engines + a vanilla-TS DOM shell. **One scene per preset.**

- **Renderer** — a single headless `@cesdk/engine` `CreativeEngine`. Builds a
  single-page scene per preset and exports PNGs. The only thing that produces
  pixels. (`src/app/renderer.ts`, `src/app/scene.ts`)
- **Editor** — one hidden `@cesdk/cesdk-js` `CreativeEditorSDK`, created once at
  startup and reused. Crop-only, shown in a modal on Edit. Also hosts
  `PagePresetsAssetSource` so the app reads the preset catalog from it.
  (`src/app/editor.ts`, `src/app/crop-editor-config.ts`)
- **Canonical state** — a serialized scene string per preset (`CropResult.sceneString`).
  Thumbnails are derived re-renders. No persistence; reload = fresh start.
  (`src/app/state.ts`)

### App source map (everything under `src/app/` + `src/index.ts`)

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Orchestrator: owns state, wires shell ↔ renderer ↔ editor, error handling. |
| `index.html` | App shell markup + all CSS (dark theme), editor modal, gallery. |
| `src/app/state.ts` | `AppState`, `CropResult`, in-memory store, thumbnail URL lifecycle. |
| `src/app/presets.ts` | Loads **social-only** presets from `ly.img.page.presets` (groups → categories; print/video groups excluded). |
| `src/app/saliency.ts` | Focal-point detection via `@imgly/background-removal` alpha centroid + head bias. **Copied verbatim** from the sibling project (see below). |
| `src/app/scene.ts` | `buildPresetScene()` — single-page scene + cover/focal framing. **Crop math lives here.** |
| `src/app/renderer.ts` | Headless engine lifecycle; `generateCrops`, `renderScene`, `focalPointFor`; the **engine serialization mutex**. |
| `src/app/crop-editor-config.ts` | Strips the editor down to crop-only (features off, UI regions emptied, frame locked). |
| `src/app/editor.ts` | `CropEditor` class: create-once, `open`/`save`/`cancel` in the modal. |
| `src/app/ui.ts` | DOM rendering (checkbox list, gallery, spinner) — no engine logic. |
| `src/app/download.ts` | Re-renders every crop sequentially → `client-zip` → one download. |

### Dead code — do NOT use for the app

`photo-editor/**` and `src/imgly/**` are the **original starter-kit** editor
(`PhotoEditorConfig`, background-removal plugin wiring, demo scene loader). The
MultiCrop app does **not** import them — its editor is `crop-editor-config.ts`.
`photo-editor/` is kept only as the *reference* the crop config was derived from.
Don't wire the app to `PhotoEditorConfig`.

## Hard-won decisions & gotchas (READ before changing engine/crop/editor code)

These were each discovered by live browser debugging; the code comments restate
them at the call sites.

1. **Headless scene has no stack.** `engine.scene.create()` yields only
   scene + camera; `'//ly.img.ubq/stack'` doesn't exist and can't be created.
   → append the page directly to the **scene block** (`create()`'s return value).
   `getPages()` still recognizes it. (`scene.ts`)

2. **Cover crop math (the important one).** Crops must be aspect-preserving cover
   crops biased to the focal point — NOT stretched, NOT letterboxed. Recipe in
   `frameToFocalPoint` (`scene.ts`):
   - `await engine.block.forceLoadResources([block])` first (Cover scale needs
     the image's natural size decoded).
   - `setContentFillMode('Cover')` → read `sx = getCropScaleX`, `sy = getCropScaleY`.
     These are CE.SDK's normalized cover scales (non-overflow axis = 1, overflow
     axis = `frameAspect/imageAspect` or its inverse). This is NOT distortion.
   - `setContentFillMode('Crop')` (preserves `sx`,`sy`) then
     `setCropTranslationX(-(sx-1)*focalX)`, `setCropTranslationY(-(sy-1)*focalY)`.
   - focal 0.5 = Cover's centered crop; 0/1 = edges; always fully covered.
   - Do NOT overwrite the translation with arbitrary values or call
     `adjustCropToFillFrame` — that was the original stretch/letterbox bug.

3. **No `ui/crop/*` engine settings in 1.76.** `setSettingString('ui/crop/...')`
   throws ("no `ui` keypath"). Lock the crop frame via
   `controlGizmo/showCropHandles=false` (+ `showCropScaleHandles=true`) and by
   stripping the inspector/panel UI. (`crop-editor-config.ts`)

4. **Crop inspector panel auto-opens** on entering Crop mode. Disable the
   `ly.img.crop.panel.autoOpen` feature AND defensively
   `ui.closePanel('//ly.img.panel/inspector/crop')` in `editor.open()`.
   (`crop-editor-config.ts`, `editor.ts`)

5. **Shared headless engine must be serialized.** `renderScene` does
   loadFromString + export on the single engine; concurrent calls (e.g. Save's
   re-render overlapping Download-all, or two Downloads) interleave and
   **deadlock**. All engine-touching sections go through the `withEngine` mutex
   in `renderer.ts`. Keep it.

6. **Editor canvas mounts only when genuinely visible.** Creating the editor in
   a `display:none` modal is fine — the WebGL canvas mounts on the first real
   `open()` (modal shown). Don't try to "warm" it off-screen with
   `display:none`/`transform:translateX(-..)`/`opacity:0` — none mount the canvas;
   they were tried and reverted. The single instance being reused IS the
   "held in background" win. (`editor.ts`, modal CSS in `index.html`)

7. **Object-URL lifetime / cross-engine portability.** The uploaded image is a
   `blob:` object URL (`state.sourceURI`) kept alive for the whole session. Scene
   strings reference it; both engines resolve it because they share the one
   browser document. Re-upload revokes the old URL **and** resets results (stale
   crops would reference a dead URL). Thumbnail URLs are revoked on re-generate
   and on edit-save. (`index.ts`, `state.ts`)

8. **Gallery layout.** Tiles are a **uniform-width grid** with a fixed 200px
   stage; the **thumbnail inside** is scaled to the crop's relative pixel size
   (shared factor: largest side → 180px) and centered. So boxes match but
   thumbnails convey relative dimensions + true aspect. (`ui.ts`, `index.html`)

## Reuse from the sibling project

`/Users/wojtek/Development/playground/multicrop-demo-1` is a *different*
architecture (in-editor panel, multi-page scene, drag-to-move blocks — not the
crop tool). Reused here: `saliency.ts` (verbatim) and the focal-point idea. Its
`crop.ts` `positionBlock` was the math reference but is re-expressed as fill-crop
in this project's `scene.ts`.

## Spec & plan (the full design history)

- Spec: `docs/superpowers/specs/2026-06-03-multicrop-social-sizes-design.md`
- Plan: `docs/superpowers/plans/2026-06-03-multicrop-social-sizes.md`

## Git

- Work is on branch **`multicrop-app`** (base `main`), pushed to
  `origin` = `git@github.com:newmetl/multicrop-demo.git`.
- All work committed and pushed; no PR opened yet (open one at the GitHub URL if
  desired). The starter-kit `upstream` remote points at the IMG.LY template.
