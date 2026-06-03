# MultiCrop — Social-Media Batch Cropper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vanilla-TS browser demo on the CE.SDK Photo Editor starter kit where a user uploads an image, picks social-media sizes, generates cropped versions headlessly, re-frames any crop in a stripped-down crop-only editor (modal), and downloads all crops as a ZIP.

**Architecture:** Two CE.SDK engines. A headless `@cesdk/engine` **renderer** builds one single-page scene per selected preset (graphic block with image fill, framed to the saliency focal point) and exports PNGs. A single pre-instantiated, hidden `@cesdk/cesdk-js` **crop-only editor** is shown in a modal on Edit; it loads that preset's scene string, enters Crop mode locked to the preset, and on Save writes the updated scene string back. The canonical state is one serialized scene string per preset. A plain vanilla-TS shell renders upload/checkboxes/gallery/spinner/download.

**Tech Stack:** TypeScript, Vite, `@cesdk/cesdk-js` + `@cesdk/engine` (v1.76.0), `@imgly/background-removal` + `onnxruntime-web` (saliency only), `client-zip` (download).

> **Testing note:** Tests are explicitly out of scope for this demo (user instruction). Verification is by `npm run check:syntax` (tsc) and manual browser checks. No unit-test framework is added.

> **Reuse note:** Two files are lifted from the sibling project `/Users/wojtek/Development/playground/multicrop-demo-1`:
> - `src/imgly/plugins/multicrop/saliency.ts` → copied verbatim to `src/app/saliency.ts`.
> - `src/imgly/plugins/multicrop/presets.ts` → adapted into `src/app/presets.ts` (social groups only).
> The focal-point→cover math in that project's `crop.ts` (`positionBlock`) is the reference for our framing math, but is re-expressed in fill-crop terms (Task 4).

---

## File Structure

- `src/index.ts` — **modify** (currently boots the full photo editor). Becomes the app entry/orchestrator.
- `index.html` — **modify**. App shell markup + base CSS; root containers for shell and the editor modal.
- `src/app/state.ts` — **create**. `AppState`, `CropResult`, in-memory store + helpers.
- `src/app/presets.ts` — **create**. Load social-only presets from `PagePresetsAssetSource`.
- `src/app/saliency.ts` — **create** (copied). Focal-point computation.
- `src/app/scene.ts` — **create**. `buildPresetScene()` — single-page scene builder + focal framing (shared by renderer & editor model).
- `src/app/renderer.ts` — **create**. Headless engine lifecycle; generate + rerender.
- `src/app/crop-editor-config.ts` — **create**. Crop-only CE.SDK config (features, empty UI orders, settings).
- `src/app/editor.ts` — **create**. Hidden crop editor lifecycle; `open`/`save`/`cancel`.
- `src/app/ui.ts` — **create**. DOM rendering + event wiring.
- `src/app/download.ts` — **create**. ZIP all rendered PNGs → one download.

Responsibility split: engine/scene logic (`renderer.ts`, `scene.ts`, `editor.ts`, `crop-editor-config.ts`) is isolated from DOM logic (`ui.ts`, `index.html`); `state.ts` is the shared, framework-free data model; `presets.ts`/`saliency.ts`/`download.ts` are leaf utilities.

---

## Task 1: Project scaffold — dependencies, entry reset, app shell markup

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Modify: `src/index.ts`
- Create: `src/app/state.ts`

- [ ] **Step 1: Install dependencies**

The starter kit's deps are not installed yet, and we add `client-zip`.

Run:
```bash
npm install
npm install client-zip@^2.4.5
```
Expected: `node_modules/` created; `client-zip` added to `package.json` dependencies. (`@cesdk/engine`, `@cesdk/cesdk-js`, `@imgly/background-removal`, `onnxruntime-web` already present.)

- [ ] **Step 2: Replace `index.html` body with the app shell**

Replace the entire contents of `index.html` with:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MultiCrop — Social Media Sizes</title>
    <style>
      :root { --bg: #0f1115; --panel: #1a1d24; --border: #2a2f3a; --fg: #e6e8ec; --muted: #9aa3b2; --accent: #4c8dff; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; }
      body { background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
      #app { max-width: 1100px; margin: 0 auto; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 16px; }
      .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
      .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-size: 14px; cursor: pointer; }
      button.secondary { background: #2a2f3a; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .sizes { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px 16px; }
      .sizes .group-title { grid-column: 1 / -1; color: var(--muted); font-weight: 600; margin-top: 8px; }
      .sizes label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
      .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
      .tile { position: relative; background: #000; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
      .tile img { display: block; width: 100%; height: 180px; object-fit: contain; background: #000; }
      .tile .caption { padding: 8px 10px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--border); }
      .tile .edit-btn { position: absolute; inset: 0 0 auto auto; margin: 8px; opacity: 0; transition: opacity .12s; }
      .tile:hover .edit-btn { opacity: 1; }
      .hidden { display: none !important; }
      .spinner { display: inline-block; width: 18px; height: 18px; border: 3px solid var(--muted); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; }
      @keyframes spin { to { transform: rotate(360deg); } }
      /* Editor modal */
      #editor-modal { position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 50; display: flex; flex-direction: column; }
      #editor-modal.hidden { display: none !important; }
      #editor-modal .modal-bar { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
      #editor-modal .modal-title { margin-right: auto; font-weight: 600; }
      #cesdk_container { flex: 1 1 auto; min-height: 0; }
    </style>
  </head>
  <body>
    <div id="app">
      <h1>MultiCrop — Social Media Sizes</h1>

      <div class="panel">
        <div class="row">
          <button id="upload-btn">Upload image</button>
          <span id="upload-name" class="muted"></span>
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
        </div>
      </div>

      <div id="sizes-panel" class="panel hidden">
        <div id="sizes" class="sizes"></div>
        <div class="row" style="margin-top: 16px;">
          <button id="generate-btn" disabled>Generate</button>
          <span id="generate-status"></span>
        </div>
      </div>

      <div id="results-panel" class="panel hidden">
        <div class="row" style="margin-bottom: 16px;">
          <strong>Generated crops</strong>
          <button id="download-all-btn" class="secondary" style="margin-left:auto;">Download all (.zip)</button>
        </div>
        <div id="gallery" class="gallery"></div>
      </div>
    </div>

    <div id="editor-modal" class="hidden">
      <div class="modal-bar">
        <span id="editor-title" class="modal-title"></span>
        <button id="editor-cancel" class="secondary">Cancel</button>
        <button id="editor-save">Save</button>
      </div>
      <div id="cesdk_container"></div>
    </div>

    <script type="module" src="/src/index.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/app/state.ts`**

```ts
/**
 * In-memory app state for MultiCrop. No persistence — a reload starts fresh.
 *
 * The canonical representation of each generated crop is its serialized
 * single-page scene string. Thumbnails are derived (re-rendered) artifacts.
 */

export interface CropResult {
  /** Stable id — the preset's asset id. */
  id: string;
  /** Human-readable label, e.g. "Instagram Story". */
  presetLabel: string;
  /** Page width in pixels. */
  width: number;
  /** Page height in pixels. */
  height: number;
  /** Serialized single-page scene (source of truth for this crop). */
  sceneString: string;
  /** Object URL of the latest rendered PNG (revoke before replacing). */
  thumbnailUrl: string;
}

export interface AppState {
  /** Object URL of the uploaded image, kept alive for the whole session. */
  sourceURI: string | null;
  /** Natural pixel dimensions of the uploaded image. */
  sourceWidth: number;
  sourceHeight: number;
  /** One result per selected preset, in selection order. */
  results: CropResult[];
}

export const state: AppState = {
  sourceURI: null,
  sourceWidth: 0,
  sourceHeight: 0,
  results: []
};

/** Find a result by id, or undefined. */
export function findResult(id: string): CropResult | undefined {
  return state.results.find((r) => r.id === id);
}

/** Replace a result's thumbnail, revoking the previous object URL. */
export function setThumbnail(result: CropResult, url: string): void {
  if (result.thumbnailUrl) URL.revokeObjectURL(result.thumbnailUrl);
  result.thumbnailUrl = url;
}
```

- [ ] **Step 4: Replace `src/index.ts` with a minimal bootstrap stub**

This will be expanded in Task 9; for now it must compile and confirm DOM wiring.
```ts
/**
 * MultiCrop entry point. Wires the app shell to the renderer + crop editor.
 * (Filled in across tasks; this stub is replaced in Task 9.)
 */

const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  // eslint-disable-next-line no-console
  console.log('Selected file:', fileInput.files?.[0]?.name);
});
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run check:syntax`
Expected: exits 0, no errors.

- [ ] **Step 6: Verify the shell renders**

Run: `npm run dev` and open the printed URL.
Expected: dark page titled "MultiCrop — Social Media Sizes" with an "Upload image" button. Clicking it opens the OS file picker; selecting a file logs its name to the console. Sizes/results panels and modal are hidden.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json index.html src/index.ts src/app/state.ts
git commit -m "feat: scaffold MultiCrop app shell, state model, and deps"
```

---

## Task 2: Saliency module (copied) + preset loader (adapted, social-only)

**Files:**
- Create: `src/app/saliency.ts`
- Create: `src/app/presets.ts`

- [ ] **Step 1: Copy saliency verbatim from the sibling project**

Run:
```bash
cp /Users/wojtek/Development/playground/multicrop-demo-1/src/imgly/plugins/multicrop/saliency.ts src/app/saliency.ts
```
Expected: `src/app/saliency.ts` exists. It exports `computeFocalPoint(imageUri, engine): Promise<FocalPoint | null>` and the `FocalPoint` interface. No edits needed — it operates on a blob/URI and only uses `engine` to read `buffer://` URIs (we pass an object URL, so the engine arg is unused but required by the signature).

- [ ] **Step 2: Verify the copied file typechecks against the engine type**

Run: `npm run check:syntax`
Expected: exits 0. (`saliency.ts` imports `@imgly/background-removal` and `@cesdk/cesdk-js` types, both installed.)

- [ ] **Step 3: Create `src/app/presets.ts` (social groups only)**

Adapted from the sibling project's `presets.ts`: the `print`/`video` groups are dropped, and the loader works against a CE.SDK instance's engine (the crop editor hosts `PagePresetsAssetSource`).
```ts
/**
 * Loads social-media page-format presets from CE.SDK's `PagePresetsAssetSource`
 * (asset source `ly.img.page.presets`), grouped by platform for the checkbox
 * list. Print and generic-video preset groups are intentionally excluded.
 *
 * Adapted from multicrop-demo-1/src/imgly/plugins/multicrop/presets.ts.
 *
 * @see https://img.ly/docs/cesdk/js/asset-management/overview/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export type CategoryId =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'pinterest';

/** Display order of platform groups in the checkbox list. */
export const CATEGORY_ORDER: CategoryId[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'pinterest'
];

/** Human-readable group headings. */
export const CATEGORY_LABEL: Record<CategoryId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
  pinterest: 'Pinterest'
};

export interface Preset {
  /** Stable asset id; used as the checkbox key + CropResult id. */
  id: string;
  /** Human-readable label, e.g. "Instagram Story". */
  label: string;
  width: number;
  height: number;
}

export type PresetsByCategory = Partial<Record<CategoryId, Preset[]>>;

const PAGE_PRESETS_SOURCE = 'ly.img.page.presets';

// Asset-group → category. Groups not listed here (print, video, etc.) are
// ignored. The `linkedIn` group key is camelCase as supplied by the source.
const GROUP_TO_CATEGORY: Record<string, CategoryId> = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedIn: 'linkedin',
  x: 'x',
  pinterest: 'pinterest'
};

/**
 * Load social-media presets grouped by category. Assets without a recognized
 * social group or without a `FixedSize` transform preset are skipped.
 */
export async function loadSocialPresets(
  cesdk: CreativeEditorSDK
): Promise<PresetsByCategory> {
  const result: PresetsByCategory = {};

  let response;
  try {
    response = await cesdk.engine.asset.findAssets(PAGE_PRESETS_SOURCE, {
      page: 0,
      perPage: 999
    });
  } catch {
    return result; // source not registered
  }

  for (const asset of response.assets) {
    const transform = asset.payload?.transformPreset;
    if (transform == null || transform.type !== 'FixedSize') continue;

    const category = (asset.groups ?? [])
      .map((g) => GROUP_TO_CATEGORY[g])
      .find((c): c is CategoryId => c != null);
    if (category == null) continue;

    const bucket = (result[category] ??= []);
    bucket.push({
      id: asset.id,
      label: asset.label ?? asset.id,
      width: transform.width,
      height: transform.height
    });
  }

  return result;
}

/** Flatten grouped presets to a lookup by id (used at generate time). */
export function indexPresets(byCategory: PresetsByCategory): Map<string, Preset> {
  const map = new Map<string, Preset>();
  for (const presets of Object.values(byCategory)) {
    for (const preset of presets ?? []) map.set(preset.id, preset);
  }
  return map;
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/saliency.ts src/app/presets.ts
git commit -m "feat: add saliency (copied) and social-only preset loader"
```

---

## Task 3: Headless renderer skeleton — engine init + scene round-trip render

**Files:**
- Create: `src/app/renderer.ts`

This task stands up the headless engine and a scene-string→PNG render path. Scene *building* lands in Task 4; here we prove the engine initializes and can export.

- [ ] **Step 1: Create `src/app/renderer.ts`**

```ts
/**
 * Headless renderer: a single `@cesdk/engine` CreativeEngine instance used to
 * build per-preset scenes (Task 4) and to render any scene string to a PNG
 * Blob. It is the only component that produces pixels; the editor only edits
 * crop transforms and hands scene strings back here to re-render.
 *
 * @see https://img.ly/docs/cesdk/node/conversion/to-png-f1660c/
 */

import CreativeEngine from '@cesdk/engine';

let enginePromise: Promise<CreativeEngine> | null = null;

/** Lazily initialize (once) and return the shared headless engine. */
export function getRenderEngine(): Promise<CreativeEngine> {
  if (enginePromise == null) {
    enginePromise = CreativeEngine.init({
      baseURL: `https://cdn.img.ly/packages/imgly/cesdk-engine/${CreativeEngine.version}/assets`
    });
  }
  return enginePromise;
}

/**
 * Render a serialized single-page scene to a PNG Blob at the page's native
 * pixel size. Loads the scene into the headless engine, exports its first
 * page, and returns the blob.
 */
export async function renderScene(sceneString: string): Promise<Blob> {
  const engine = await getRenderEngine();
  await engine.scene.loadFromString(sceneString);
  const page = engine.block.findByType('page')[0];
  if (page == null) throw new Error('renderScene: scene has no page');
  return engine.block.export(page, { mimeType: 'image/png' });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0. (If TS cannot find a default export for `@cesdk/engine`, change the import to `import { CreativeEngine } from '@cesdk/engine';` and re-run — the package ships both; use whichever the installed types resolve.)

- [ ] **Step 3: Commit**

```bash
git add src/app/renderer.ts
git commit -m "feat: add headless render engine init + scene render-to-PNG"
```

---

## Task 4: Scene builder + focal framing — THE CROP-MODEL SPIKE

**Files:**
- Create: `src/app/scene.ts`
- Modify: `src/index.ts` (temporary spike harness; reverted in Task 9)

> **Why this is its own task / risk callout:** The whole demo rests on the crop
> tool engaging a graphic block with an image fill, framed to a focal point,
> and the *whole original image* remaining available when re-cropping. We build
> the scene model here and verify it visually before anything depends on it. If
> the focal-point→translation math looks wrong, fall back to centered `Cover`
> (translation 0) — coverage is guaranteed either way.

**The scene model (per preset):**
- scene → stack → page sized to the preset (W×H px).
- one graphic block, image fill, sized exactly to the page, positioned at (0,0), page `setClipped(true)`.
- `setContentFillMode(block, 'Crop')`, then frame to the focal point (below).
- The block is the crop target: selecting it + `setEditMode('Crop')` shows the fixed-frame crop UI with the full image floating behind it.

- [ ] **Step 1: Create `src/app/scene.ts`**

```ts
/**
 * Builds a single-page "photo" scene for one preset: a page sized to the preset
 * holding one graphic block (image fill) sized to the page, with the image
 * framed to cover the page and biased toward a saliency focal point. The block
 * uses content fill mode 'Crop' so the crop tool re-frames it non-destructively
 * with the whole original image available.
 *
 * The image is referenced by an object URL (blob:) that both the headless
 * renderer and the editor resolve within the same browser document, so the
 * serialized scene string is portable between the two engines.
 *
 * Focal framing is adapted from multicrop-demo-1's crop.ts `positionBlock`,
 * re-expressed in fill-crop translation terms.
 *
 * @see https://img.ly/docs/cesdk/js/edit-image/transform/crop-f67a47/
 */

import type CreativeEngine from '@cesdk/engine';
import type { FocalPoint } from './saliency';

interface PresetSize {
  width: number;
  height: number;
}

/**
 * Build the scene in `engine` and return its serialized string. Leaves the
 * built scene loaded in `engine` (callers that only want the string can ignore
 * that; render paths re-load anyway).
 *
 * @returns the serialized scene string and the id of the croppable image block.
 */
export async function buildPresetScene(
  engine: CreativeEngine,
  imageURI: string,
  imageWidth: number,
  imageHeight: number,
  preset: PresetSize,
  focalPoint: FocalPoint | null
): Promise<{ sceneString: string; imageBlock: number }> {
  engine.scene.create();
  const stack = engine.block.findByType('//ly.img.ubq/stack')[0];

  const page = engine.block.create('//ly.img.ubq/page');
  engine.block.setWidth(page, preset.width);
  engine.block.setHeight(page, preset.height);
  engine.block.setClipped(page, true);
  engine.block.appendChild(stack, page);

  const imageBlock = engine.block.create('//ly.img.ubq/graphic');
  engine.block.setShape(
    imageBlock,
    engine.block.createShape('//ly.img.ubq/shape/rect')
  );
  engine.block.setKind(imageBlock, 'image');

  const fill = engine.block.createFill('//ly.img.ubq/fill/image');
  engine.block.setString(fill, 'fill/image/imageFileURI', imageURI);
  engine.block.setFill(imageBlock, fill);

  // Block fills the page frame exactly; the image floats inside it via crop.
  engine.block.setWidth(imageBlock, preset.width);
  engine.block.setHeight(imageBlock, preset.height);
  engine.block.setPositionX(imageBlock, 0);
  engine.block.setPositionY(imageBlock, 0);
  engine.block.appendChild(page, imageBlock);

  frameToFocalPoint(
    engine,
    imageBlock,
    imageWidth,
    imageHeight,
    preset,
    focalPoint
  );

  const sceneString = await engine.scene.saveToString();
  return { sceneString, imageBlock };
}

/**
 * Cover the frame and bias toward the focal point. Starts from 'Cover' (which
 * guarantees the image covers the frame, centered), then — on the axis that
 * overflows — translates so the focal point moves toward the frame center,
 * clamped to keep full coverage. With no focal point, leaves the centered
 * cover as-is.
 *
 * Crop translation is a fraction of the frame in [-1, 1]; positive X moves
 * content right, positive Y moves content down (per CE.SDK crop docs).
 */
function frameToFocalPoint(
  engine: CreativeEngine,
  block: number,
  imageWidth: number,
  imageHeight: number,
  preset: PresetSize,
  focalPoint: FocalPoint | null
): void {
  engine.block.setContentFillMode(block, 'Cover');
  if (focalPoint == null) return;

  const frameAspect = preset.width / preset.height;
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : frameAspect;

  // Switch to manual so translation sticks, preserving Cover's scale.
  engine.block.setContentFillMode(block, 'Crop');

  if (imageAspect > frameAspect) {
    // Image is wider than frame → horizontal overflow. Fraction of the image
    // that overflows the frame width (total, both sides):
    const overflow = 1 - frameAspect / imageAspect;
    // Move focal point to center: shift by (0.5 - focalX) of the image width;
    // expressed as a fraction of the frame, the usable range is ±overflow/... .
    // The translation that recenters the focal point, clamped to ±overflow:
    const tx = clamp((0.5 - focalPoint.x) * 2, -overflow, overflow);
    engine.block.setCropTranslationX(block, tx);
  } else if (imageAspect < frameAspect) {
    const overflow = 1 - imageAspect / frameAspect;
    const ty = clamp((0.5 - focalPoint.y) * 2, -overflow, overflow);
    engine.block.setCropTranslationY(block, ty);
  }

  // Guarantee no gaps after translating.
  engine.block.adjustCropToFillFrame(block, 1.0);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
```

- [ ] **Step 2: Add a temporary spike harness to `src/index.ts`**

Replace `src/index.ts` with this spike (it builds one scene from an uploaded file and renders it to an `<img>` so we can eyeball the framing). This is reverted in Task 9.
```ts
import { getRenderEngine } from './app/renderer';
import { buildPresetScene } from './app/scene';
import { computeFocalPoint } from './app/saliency';

const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const gallery = document.getElementById('gallery') as HTMLDivElement;
document.getElementById('results-panel')!.classList.remove('hidden');

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (file == null) return;
  const uri = URL.createObjectURL(file);
  const { width, height } = await getImageSize(uri);
  const engine = await getRenderEngine();
  const focal = await computeFocalPoint(uri, engine as any);

  // 9:16 portrait (Instagram Story) and 16:9 landscape to exercise both axes.
  for (const preset of [
    { label: '1080x1920', width: 1080, height: 1920 },
    { label: '1920x1080', width: 1920, height: 1080 }
  ]) {
    const { sceneString } = await buildPresetScene(
      engine,
      uri,
      width,
      height,
      preset,
      focal
    );
    await engine.scene.loadFromString(sceneString);
    const page = engine.block.findByType('page')[0];
    const blob = await engine.block.export(page, { mimeType: 'image/png' });
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.style.width = '220px';
    gallery.appendChild(img);
  }
});

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image load failed'));
    img.src = uri;
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Spike verification in the browser (the important one)**

Run: `npm run dev`, open the URL, upload a photo with a clear subject (e.g. a person).
Expected:
- Two rendered crops appear (portrait + landscape), each fully covered (no empty/transparent edges).
- The subject is reasonably framed (not cut off) — the focal point bias is working.

If the subject is pushed the *wrong* way or the edge shows a gap: this is the calibration risk the task exists for. Apply this fallback and re-verify:
- In `frameToFocalPoint`, comment out the two `setCropTranslation*` lines (leave `setContentFillMode(block, 'Cover')` and skip the rest). This yields centered cover — always valid coverage. Then iterate on the translation sign/magnitude with the dev server open until framing is correct. Record the final working formula in a code comment.

Do not proceed to Task 5 until rendered crops are correctly covered (focal bias can be "good enough"; coverage must be perfect).

- [ ] **Step 5: Commit**

```bash
git add src/app/scene.ts src/index.ts
git commit -m "feat: add per-preset scene builder with focal framing (verified)"
```

---

## Task 5: Renderer generate API — focal point + per-preset results

**Files:**
- Modify: `src/app/renderer.ts`

- [ ] **Step 1: Add `generateCrops` to `src/app/renderer.ts`**

Append these imports/functions to `renderer.ts`:
```ts
import { buildPresetScene } from './scene';
import { computeFocalPoint, type FocalPoint } from './saliency';
import type { Preset } from './presets';
import type { CropResult } from './state';

/** Compute the focal point for the source image once (cached in saliency.ts). */
export async function focalPointFor(imageURI: string): Promise<FocalPoint | null> {
  const engine = await getRenderEngine();
  // saliency only uses the engine for buffer:// URIs; object URLs pass through.
  return computeFocalPoint(imageURI, engine as never);
}

/**
 * Build a scene + render a thumbnail for each preset, in order. Returns one
 * CropResult per preset. The source image must be an object URL kept alive for
 * the session (so the scene strings stay loadable by the editor).
 */
export async function generateCrops(
  imageURI: string,
  imageWidth: number,
  imageHeight: number,
  presets: Preset[],
  focalPoint: FocalPoint | null
): Promise<CropResult[]> {
  const engine = await getRenderEngine();
  const results: CropResult[] = [];

  for (const preset of presets) {
    const { sceneString } = await buildPresetScene(
      engine,
      imageURI,
      imageWidth,
      imageHeight,
      preset,
      focalPoint
    );
    const blob = await renderScene(sceneString);
    results.push({
      id: preset.id,
      presetLabel: preset.label,
      width: preset.width,
      height: preset.height,
      sceneString,
      thumbnailUrl: URL.createObjectURL(blob)
    });
  }

  return results;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/renderer.ts
git commit -m "feat: add renderer generateCrops + focal-point helper"
```

---

## Task 6: Crop-only editor config

**Files:**
- Create: `src/app/crop-editor-config.ts`

- [ ] **Step 1: Create `src/app/crop-editor-config.ts`**

```ts
/**
 * Crop-only editor configuration: a stripped-down photo editor exposing nothing
 * but the canvas and the crop rectangle. Every dock/panel/bar/menu is emptied,
 * all features except crop are disabled, and the crop frame is locked to the
 * page (no aspect-ratio selection, no crop resize handles) so the user can only
 * pan/scale the image within the fixed preset frame.
 *
 * Settings mirror the relevant crop/page settings from the starter kit's
 * photo-editor/settings.ts (single-image crop behavior).
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export function configureCropEditor(cesdk: CreativeEditorSDK): void {
  const { engine } = cesdk;

  // --- Features: crop only ---
  cesdk.feature.enable(['ly.img.crop']);
  // Disable everything that would add chrome or editing affordances.
  cesdk.feature.disable([
    'ly.img.text',
    'ly.img.filter',
    'ly.img.adjustment',
    'ly.img.effect',
    'ly.img.blur',
    'ly.img.shadow',
    'ly.img.delete',
    'ly.img.duplicate',
    'ly.img.group',
    'ly.img.replace',
    'ly.img.dock',
    'ly.img.library.panel',
    'ly.img.navigation.bar',
    'ly.img.inspector.bar',
    'ly.img.canvas.menu'
  ]);

  // --- UI: empty every region so only the canvas + crop gizmo remain ---
  cesdk.ui.setComponentOrder({ in: 'ly.img.dock' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.navigation.bar' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.bar', at: 'top' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.bar', at: 'bottom' }, []);
  cesdk.ui.setComponentOrder(
    { in: 'ly.img.canvas.menu', when: { editMode: 'Crop' } },
    []
  );

  // --- Crop frame locked to the preset ---
  // Hide the aspect-ratio selector and the crop resize handles, so the frame
  // can't be resized — only the image is pannable/scalable inside it.
  engine.editor.setSettingString('ui/crop/aspectRatios', '');
  engine.editor.setSettingBool('ui/crop/allowAspectRatioSelection', false);
  engine.editor.setSettingBool('controlGizmo/showCropHandles', false);
  // Keep scale handles so users can zoom the image within the frame.
  engine.editor.setSettingBool('controlGizmo/showCropScaleHandles', true);

  // --- Page/crop visuals ---
  engine.editor.setSetting('page/dimOutOfPageAreas', true);
  engine.editor.setSetting('page/highlightWhenCropping', true);
  engine.editor.setSetting('page/title/show', false);
  engine.editor.setSetting('doubleClickToCropEnabled', false);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0. (If a `setSettingBool`/`setSettingString` name is rejected by the types, use the generic `setSetting` overload with the same key/value; both exist on the engine editor API.)

- [ ] **Step 3: Commit**

```bash
git add src/app/crop-editor-config.ts
git commit -m "feat: add crop-only editor configuration"
```

---

## Task 7: Hidden crop editor — create once, open/save/cancel in modal

**Files:**
- Create: `src/app/editor.ts`

- [ ] **Step 1: Create `src/app/editor.ts`**

```ts
/**
 * The crop editor: one CreativeEditorSDK instance created once at startup and
 * kept hidden inside the editor modal. On open it loads the target preset's
 * scene string, selects the croppable image block, and enters Crop mode; on
 * save it serializes the scene back. The instance is reused across edits, so
 * opening is instant.
 *
 * It also hosts PagePresetsAssetSource so the app can read the social-media
 * preset catalog from a single CE.SDK instance.
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';
import { PagePresetsAssetSource } from '@cesdk/cesdk-js/plugins';

import { configureCropEditor } from './crop-editor-config';

export interface CropEditorCallbacks {
  onSave: (sceneString: string) => void;
  onCancel: () => void;
}

export class CropEditor {
  private cesdk!: CreativeEditorSDK;
  private modal: HTMLElement;
  private title: HTMLElement;
  private currentImageBlock: number | null = null;

  private constructor(modal: HTMLElement, title: HTMLElement) {
    this.modal = modal;
    this.title = title;
  }

  /** Create the editor instance (once) and wire modal buttons. */
  static async create(callbacks: CropEditorCallbacks): Promise<CropEditor> {
    const modal = document.getElementById('editor-modal') as HTMLElement;
    const title = document.getElementById('editor-title') as HTMLElement;
    const instance = new CropEditor(modal, title);

    const cesdk = await CreativeEditorSDK.create('#cesdk_container', {
      userId: 'multicrop-demo-user'
    });
    instance.cesdk = cesdk;

    configureCropEditor(cesdk);
    await cesdk.addPlugin(new PagePresetsAssetSource());

    const saveBtn = document.getElementById('editor-save') as HTMLButtonElement;
    const cancelBtn = document.getElementById('editor-cancel') as HTMLButtonElement;
    saveBtn.addEventListener('click', async () => {
      const sceneString = await instance.save();
      callbacks.onSave(sceneString);
    });
    cancelBtn.addEventListener('click', () => {
      instance.hide();
      callbacks.onCancel();
    });

    return instance;
  }

  /** Expose the SDK so the app can read presets from this instance. */
  get sdk(): CreativeEditorSDK {
    return this.cesdk;
  }

  /**
   * Show the modal and load the given scene for cropping. Selects the image
   * block, enters Crop mode, and fits the page to the viewport.
   */
  async open(sceneString: string, label: string): Promise<void> {
    const { engine } = this.cesdk;
    this.title.textContent = `Edit crop — ${label}`;
    this.modal.classList.remove('hidden');

    await engine.scene.loadFromString(sceneString);
    const page = engine.block.findByType('page')[0];
    const imageBlock = engine.block
      .getChildren(page)
      .find((id) => engine.block.supportsCrop(id));
    if (imageBlock == null) throw new Error('open: no croppable block in scene');
    this.currentImageBlock = imageBlock;

    await this.fitPage(page);
    engine.block.select(imageBlock);
    engine.editor.setEditMode('Crop');
  }

  /** Exit crop mode and serialize the (edited) scene. Hides the modal. */
  async save(): Promise<string> {
    const { engine } = this.cesdk;
    engine.editor.setEditMode('Transform');
    const sceneString = await engine.scene.saveToString();
    this.hide();
    return sceneString;
  }

  hide(): void {
    this.modal.classList.add('hidden');
    this.currentImageBlock = null;
  }

  /**
   * Fit the page to the viewport, waiting for the canvas to settle (the modal
   * was just shown, so the container size may stabilize over a few frames).
   * Mirrors multicrop-demo-1's fitPageToViewport.
   */
  private async fitPage(page: number): Promise<void> {
    const { engine } = this.cesdk;
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    engine.scene.enableZoomAutoFit(page, 'Both', 40, 40, 40, 40);
    let previous = -1;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await nextFrame();
      const zoom = engine.scene.getZoomLevel();
      if (zoom > 0.01 && Math.abs(zoom - previous) < 0.0005) break;
      previous = zoom;
    }
    engine.scene.disableZoomAutoFit(page);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0. (If `engine.block.getChildren` returns a readonly array that `.find` rejects, wrap with `Array.from(...)`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/editor.ts
git commit -m "feat: add hidden crop editor with modal open/save/cancel"
```

---

## Task 8: Download-all as ZIP

**Files:**
- Create: `src/app/download.ts`

- [ ] **Step 1: Create `src/app/download.ts`**

```ts
/**
 * Bundle every generated crop into a single ZIP and trigger one download.
 * Each crop is freshly re-rendered from its canonical scene string so the ZIP
 * always reflects the latest edits (not the possibly-stale thumbnail).
 *
 * @see https://github.com/Touffy/client-zip
 */

import { downloadZip } from 'client-zip';

import { renderScene } from './renderer';
import type { CropResult } from './state';

/** Filesystem-safe file name for a crop, e.g. "instagram-story-1080x1920.png". */
function fileNameFor(result: CropResult): string {
  const slug = result.presetLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${slug}-${result.width}x${result.height}.png`;
}

/** Re-render all results, zip them, and trigger a browser download. */
export async function downloadAll(results: CropResult[]): Promise<void> {
  const files = await Promise.all(
    results.map(async (result) => ({
      name: fileNameFor(result),
      input: await renderScene(result.sceneString)
    }))
  );

  const zipBlob = await downloadZip(files).blob();
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'multicrop-export.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/download.ts
git commit -m "feat: add download-all ZIP export"
```

---

## Task 9: UI rendering module + final orchestration

**Files:**
- Create: `src/app/ui.ts`
- Modify: `src/index.ts` (replace the Task 4 spike with the real orchestrator)

- [ ] **Step 1: Create `src/app/ui.ts`**

```ts
/**
 * DOM rendering + event wiring for the app shell: the size checkbox list, the
 * results gallery (hover → Edit), the generate spinner, and panel visibility.
 * Holds no engine logic — it calls back into the orchestrator (index.ts).
 */

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type PresetsByCategory
} from './presets';
import type { CropResult } from './state';

const $ = (id: string) => document.getElementById(id)!;

/** Render the grouped checkbox list. Returns nothing; read selection on demand. */
export function renderSizeList(byCategory: PresetsByCategory): void {
  const container = $('sizes');
  container.innerHTML = '';
  for (const category of CATEGORY_ORDER) {
    const presets = byCategory[category];
    if (presets == null || presets.length === 0) continue;

    const heading = document.createElement('div');
    heading.className = 'group-title';
    heading.textContent = CATEGORY_LABEL[category];
    container.appendChild(heading);

    for (const preset of presets) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = preset.id;
      cb.dataset.presetCheckbox = 'true';
      const span = document.createElement('span');
      span.textContent = `${preset.label} (${preset.width}×${preset.height})`;
      label.append(cb, span);
      container.appendChild(label);
    }
  }
  $('sizes-panel').classList.remove('hidden');
}

/** Selected preset ids, in DOM order. */
export function selectedPresetIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[data-preset-checkbox]:checked'
    )
  ).map((cb) => cb.value);
}

/** Enable/disable Generate based on whether anything is checked. */
export function wireSelectionToGenerate(): void {
  const generateBtn = $('generate-btn') as HTMLButtonElement;
  $('sizes').addEventListener('change', () => {
    generateBtn.disabled = selectedPresetIds().length === 0;
  });
}

export function setGenerating(isGenerating: boolean): void {
  const status = $('generate-status');
  const btn = $('generate-btn') as HTMLButtonElement;
  btn.disabled = isGenerating || selectedPresetIds().length === 0;
  status.innerHTML = isGenerating
    ? '<span class="spinner"></span> Generating…'
    : '';
}

/** Render the gallery from results, wiring each Edit button via `onEdit`. */
export function renderGallery(
  results: CropResult[],
  onEdit: (id: string) => void
): void {
  const gallery = $('gallery');
  gallery.innerHTML = '';
  for (const result of results) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;

    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = `${result.presetLabel} · ${result.width}×${result.height}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => onEdit(result.id));

    tile.append(img, caption, editBtn);
    gallery.appendChild(tile);
  }
  $('results-panel').classList.remove('hidden');
}

/** Update a single tile's image after a re-render (no full re-render). */
export function updateTile(result: CropResult): void {
  const tile = document.querySelector<HTMLElement>(
    `.tile[data-result-id="${result.id}"] img`
  );
  if (tile != null) (tile as HTMLImageElement).src = result.thumbnailUrl;
}

export function setUploadName(name: string): void {
  $('upload-name').textContent = name;
}
```

- [ ] **Step 2: Replace `src/index.ts` with the real orchestrator**

```ts
/**
 * MultiCrop orchestrator. Owns app state and wires the shell, the headless
 * renderer, and the hidden crop editor together.
 */

import { CropEditor } from './app/editor';
import {
  generateCrops,
  focalPointFor,
  renderScene
} from './app/renderer';
import { downloadAll } from './app/download';
import {
  indexPresets,
  loadSocialPresets,
  type Preset
} from './app/presets';
import { findResult, setThumbnail, state } from './app/state';
import {
  renderGallery,
  renderSizeList,
  selectedPresetIds,
  setGenerating,
  setUploadName,
  updateTile,
  wireSelectionToGenerate
} from './app/ui';

let editor: CropEditor;
let presetIndex: Map<string, Preset> = new Map();

async function main(): Promise<void> {
  // Create the hidden crop editor once; it also hosts the preset catalog.
  editor = await CropEditor.create({
    onSave: handleEditorSave,
    onCancel: () => {}
  });

  const byCategory = await loadSocialPresets(editor.sdk);
  presetIndex = indexPresets(byCategory);
  renderSizeList(byCategory);
  wireSelectionToGenerate();

  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleUpload(fileInput));

  document
    .getElementById('generate-btn')!
    .addEventListener('click', handleGenerate);
  document
    .getElementById('download-all-btn')!
    .addEventListener('click', () => downloadAll(state.results));
}

async function handleUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file == null) return;
  if (state.sourceURI) URL.revokeObjectURL(state.sourceURI);
  state.sourceURI = URL.createObjectURL(file);
  const { width, height } = await getImageSize(state.sourceURI);
  state.sourceWidth = width;
  state.sourceHeight = height;
  setUploadName(file.name);
}

async function handleGenerate(): Promise<void> {
  if (state.sourceURI == null) return;
  const ids = selectedPresetIds();
  const presets = ids
    .map((id) => presetIndex.get(id))
    .filter((p): p is Preset => p != null);
  if (presets.length === 0) return;

  setGenerating(true);
  try {
    const focal = await focalPointFor(state.sourceURI);
    const results = await generateCrops(
      state.sourceURI,
      state.sourceWidth,
      state.sourceHeight,
      presets,
      focal
    );
    state.results = results;
    renderGallery(results, handleEdit);
  } finally {
    setGenerating(false);
  }
}

let editingId: string | null = null;

async function handleEdit(id: string): Promise<void> {
  const result = findResult(id);
  if (result == null) return;
  editingId = id;
  await editor.open(result.sceneString, result.presetLabel);
}

async function handleEditorSave(sceneString: string): Promise<void> {
  if (editingId == null) return;
  const result = findResult(editingId);
  editingId = null;
  if (result == null) return;
  result.sceneString = sceneString;
  const blob = await renderScene(sceneString);
  setThumbnail(result, URL.createObjectURL(blob));
  updateTile(result);
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image: ${uri}`));
    img.src = uri;
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('MultiCrop failed to start:', error);
});
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/ui.ts src/index.ts
git commit -m "feat: wire UI rendering and full app orchestration"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the app**

Run: `npm run dev` and open the URL.

- [ ] **Step 2: Walk the full flow and confirm each requirement**

Confirm, in order:
1. **Upload** — click Upload, pick an image; its filename appears; the sizes panel appears.
2. **Checkbox list** — social platforms (Instagram, Facebook, TikTok, YouTube, LinkedIn, X, Pinterest) are grouped with labelled sizes; *no* print/video groups. Generate is disabled until at least one box is checked.
3. **Generate** — check 3–4 sizes across platforms, click Generate; a spinner shows; then a gallery of crops appears, each fully covered and focal-framed.
4. **Hover → Edit** — hovering a tile reveals an Edit button.
5. **Edit opens fast in a modal** — clicking Edit opens the modal *immediately* (editor was pre-created); the canvas shows the crop rectangle over the **whole original image**, with no dock/panels/nav bar/menus — only Save/Cancel in the modal bar.
6. **Locked frame** — the crop frame cannot be resized to a different aspect ratio; the image can be panned/scaled within it; the whole original is reachable.
7. **Save** — adjust the framing, click Save; the modal closes and that tile updates to the new crop.
8. **Re-edit persists** — click Edit on the same tile again; it reopens at the saved framing (proves scene-string round-trip).
9. **Download all** — click Download all; a single `multicrop-export.zip` downloads containing one PNG per crop at the correct pixel sizes, reflecting any edits.

- [ ] **Step 3: Confirm no console errors**

Expected: no uncaught errors in the browser console during the flow.

- [ ] **Step 4: Final typecheck + commit any fixes**

Run: `npm run check:syntax`
Expected: exits 0. Commit any fixes made during verification:
```bash
git add -A
git commit -m "fix: address issues found in end-to-end verification"
```

---

## Notes for the implementer

- **Object-URL lifetime:** `state.sourceURI` must stay alive for the whole session — the per-preset scene strings reference it, and both engines resolve it within the same document. Only revoke it when replacing the upload.
- **Two engines, one document:** the headless renderer (`@cesdk/engine`) and the editor (`@cesdk/cesdk-js`) are independent engines but share the browser document, so `blob:` URIs are mutually resolvable and scene strings are portable between them.
- **Watermark:** no license key is configured (same as the starter kit). Exports carry the CE.SDK trial watermark — acceptable for a demo.
- **Crop framing risk** is contained to `frameToFocalPoint` in `scene.ts` and is verified in Task 4 before anything depends on it; centered `Cover` is the guaranteed fallback.
