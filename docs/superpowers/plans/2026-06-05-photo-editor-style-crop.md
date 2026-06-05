# Photo-Editor-Style Crop Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the modal crop editor behave like CE.SDK's native crop tool — whole source image visible with dimmed overflow, a resizable aspect-locked crop rectangle, engine-native coverage clamping.

**Architecture:** Restructure each per-preset scene from "page = preset, block fills page" to "page = source image, with a preset-aspect **crop block** as a sub-region." The renderer exports that crop block at the preset's exact pixels via `targetWidth/targetHeight`. Coverage-clamp, overflow rendering, and aspect-lock are all engine-native.

**Tech Stack:** TypeScript, Vite, `@cesdk/engine` (headless renderer), `@cesdk/cesdk-js` (modal editor), vanilla DOM.

**Spec:** `docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md`

> **No test suite (project policy — CLAUDE.md):** tests are intentionally out of scope for this demo. The verification gate for every task is `npm run check:syntax` (`tsc --noEmit`) **plus** the specified manual browser check. There are no unit-test steps.

---

## How to run the manual browser checks

The dev server is defined in `.claude/launch.json` as `multicrop-dev`.

1. Start it: `npm run dev` (serves http://localhost:5173).
2. In the browser (or preview tool): wait for the startup overlay to clear (cold start ~60–90s — two CE.SDK engines + the ONNX model load), click **Upload**, choose a test image (prefer a wide landscape photo with an obvious subject, so focal framing and overflow are visible), tick **one** size (e.g. an Instagram 1:1 or a 9:16 story), click **Generate**.
3. To exercise the editor: hover a gallery tile → click **Edit**.

Keep this image/preset handy across tasks — the same flow verifies each one.

---

## File Structure

| File | Change |
| --- | --- |
| `src/app/renderer.ts` | `renderScene` gains `targetWidth/targetHeight` params and exports the **crop block** (not the page) via a new `findCropBlock` helper. |
| `src/app/download.ts` | Update the `renderScene` call site to pass `result.width/height`. |
| `src/index.ts` | Update the `renderScene` call site (editor-save re-render) to pass `result.width/height`. |
| `src/app/scene.ts` | Rewrite `buildPresetScene`; add `computeCropRect` (geometry) and `coverCropRectToPage` (fill alignment); remove `frameToFocalPoint`. |
| `src/app/crop-editor-config.ts` | Show crop handles (`showCropHandles = true`). |
| `src/app/editor.ts` | Defensively re-assert the crop aspect-ratio lock in `open()`. |
| `CLAUDE.md` | Update gotchas #2 & #3, the source map, and the renderer note. |
| `docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md` | Flip Status to Implemented. |

Task order is chosen so the app stays runnable after every commit. Task 1 (renderer) is behaviorally a no-op against the *current* scene (block = page = preset, so exporting the block at preset px equals exporting the page), which lets it land safely before Task 2 activates the new scene shape.

---

## Task 1: Renderer exports the crop block at the preset's exact pixels

**Files:**
- Modify: `src/app/renderer.ts` (the `renderScene` function + a new helper)
- Modify: `src/app/download.ts:32` (call site)
- Modify: `src/index.ts:140` (call site)

- [ ] **Step 1: Rewrite `renderScene` and add `findCropBlock` in `src/app/renderer.ts`**

Replace the existing `renderScene` function (currently lines ~47–60, the block starting with the `/** Render a serialized single-page scene ... */` comment and ending at the closing `}` of `renderScene`) with:

```ts
/** Find the croppable image block (the crop rectangle) in the loaded scene. */
function findCropBlock(engine: CreativeEngine): number {
  const page = engine.block.findByType('page')[0];
  if (page == null) throw new Error('renderScene: scene has no page');
  const block = engine.block
    .getChildren(page)
    .find((id) => engine.block.supportsCrop(id));
  if (block == null) throw new Error('renderScene: scene has no croppable block');
  return block;
}

/**
 * Render a serialized scene's crop block to a PNG Blob at the preset's exact
 * pixel size. The crop block's frame is the crop rectangle (a sub-region of an
 * image-sized page); `targetWidth/targetHeight` scale that region to the preset
 * dimensions while preserving aspect. Serialized against all other engine ops.
 */
export function renderScene(
  sceneString: string,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  return withEngine(async () => {
    const engine = await getRenderEngine();
    await engine.scene.loadFromString(sceneString);
    const cropBlock = findCropBlock(engine);
    return engine.block.export(cropBlock, {
      mimeType: 'image/png',
      targetWidth,
      targetHeight
    });
  });
}
```

- [ ] **Step 2: Update the `generateCrops` call site in `src/app/renderer.ts`**

In `generateCrops`, change the render call (currently `const blob = await renderScene(sceneString);`, ~line 98) to:

```ts
    const blob = await renderScene(sceneString, preset.width, preset.height);
```

- [ ] **Step 3: Update the `download.ts` call site**

In `src/app/download.ts`, change line 32 from `input: await renderScene(result.sceneString)` to:

```ts
      input: await renderScene(result.sceneString, result.width, result.height)
```

- [ ] **Step 4: Update the `index.ts` call site**

In `src/index.ts` `handleEditorSave`, change line 140 from `const blob = await renderScene(sceneString);` to:

```ts
    const blob = await renderScene(sceneString, result.width, result.height);
```

- [ ] **Step 5: Syntax gate**

Run: `npm run check:syntax`
Expected: exits 0, no errors. (Confirms all three call sites match the new signature.)

- [ ] **Step 6: Browser check — no visible regression**

Run the flow in "How to run the manual browser checks." Generate crops.
Expected: thumbnails look exactly as before this task — correct aspect, correct framing, and the tile's labelled size unchanged. (With the *current* scene, block = page = preset, so exporting the block at preset px is identical to the old page export.) Optionally click **Download all** and confirm the ZIP's PNGs open at the right sizes.

- [ ] **Step 7: Commit**

```bash
git add src/app/renderer.ts src/app/download.ts src/index.ts
git commit -m "refactor: render the crop block at preset px via targetWidth/targetHeight

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rewrite the scene as a crop block on an image-sized page

**Files:**
- Modify: `src/app/scene.ts` (whole file rewrite of the build logic)

- [ ] **Step 1: Replace the body of `src/app/scene.ts`**

Replace everything from the module doc comment's end through the end of the file (i.e. the `buildPresetScene` and `frameToFocalPoint` definitions, plus the `PresetSize` interface) with the following. Keep the existing top imports (`import type CreativeEngine from '@cesdk/engine';` and `import type { FocalPoint } from './saliency';`). Update the module doc comment to describe the new structure.

```ts
/**
 * Builds a per-preset "photo" scene whose page is sized to the SOURCE IMAGE and
 * that holds a single image block whose FRAME IS THE CROP RECTANGLE — the
 * largest preset-aspect rectangle that fits the image, positioned at the
 * saliency focal point. The image fill is aligned 1:1 to the page, so the whole
 * image is visible (the area outside the crop rectangle shows as dimmed overflow
 * in crop mode), exactly like CE.SDK's native crop tool. The renderer exports
 * this block at the preset's exact pixels (see renderer.ts).
 *
 * The image is referenced by an object URL (blob:) that both the headless
 * renderer and the editor resolve within the same browser document.
 *
 * @see https://img.ly/docs/cesdk/js/edit-image/transform/crop-f67a47/
 */

import type CreativeEngine from '@cesdk/engine';
import type { FocalPoint } from './saliency';

interface PresetSize {
  width: number;
  height: number;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The largest preset-aspect rectangle that fits inside the image, positioned so
 * its centre sits on the focal point (clamped to stay fully inside the image).
 * One dimension always equals the full image dimension, so covering it leaves
 * the image at ~1:1 scale — i.e. the whole image is shown, the rectangle is a
 * sub-window, and the remainder is overflow.
 */
function computeCropRect(
  imageW: number,
  imageH: number,
  preset: PresetSize,
  focal: FocalPoint | null
): CropRect {
  const presetAspect = preset.width / preset.height;
  const imageAspect = imageW / imageH;
  let w: number;
  let h: number;
  if (imageAspect > presetAspect) {
    h = imageH;
    w = imageH * presetAspect;
  } else {
    w = imageW;
    h = imageW / presetAspect;
  }
  const fx = focal?.x ?? 0.5;
  const fy = focal?.y ?? 0.5;
  const x = Math.min(Math.max(fx * imageW - w / 2, 0), imageW - w);
  const y = Math.min(Math.max(fy * imageH - h / 2, 0), imageH - h);
  return { x, y, w, h };
}

/**
 * Build the scene in `engine` and return its serialized string.
 *
 * @returns the serialized scene string for the built scene.
 */
export async function buildPresetScene(
  engine: CreativeEngine,
  imageURI: string,
  imageWidth: number,
  imageHeight: number,
  preset: PresetSize,
  focalPoint: FocalPoint | null
): Promise<string> {
  // A fresh headless scene contains only the scene + camera (no stack block,
  // and stacks can't be created directly), so the page is appended straight to
  // the scene block, which `create()` returns.
  const scene = engine.scene.create();

  // Page = the whole source image, so the editor shows the full image with the
  // crop block as a sub-region. Not clipped: the crop overlay shows fill freely.
  const page = engine.block.create('//ly.img.ubq/page');
  engine.block.setWidth(page, imageWidth);
  engine.block.setHeight(page, imageHeight);
  engine.block.setClipped(page, false);
  engine.block.appendChild(scene, page);

  const crop = computeCropRect(imageWidth, imageHeight, preset, focalPoint);

  const imageBlock = engine.block.create('//ly.img.ubq/graphic');
  engine.block.setShape(
    imageBlock,
    engine.block.createShape('//ly.img.ubq/shape/rect')
  );
  engine.block.setKind(imageBlock, 'image');

  const fill = engine.block.createFill('//ly.img.ubq/fill/image');
  engine.block.setString(fill, 'fill/image/imageFileURI', imageURI);
  engine.block.setFill(imageBlock, fill);

  // The block's FRAME is the crop rectangle (a sub-region of the page).
  engine.block.setWidth(imageBlock, crop.w);
  engine.block.setHeight(imageBlock, crop.h);
  engine.block.setPositionX(imageBlock, crop.x);
  engine.block.setPositionY(imageBlock, crop.y);
  engine.block.appendChild(page, imageBlock);

  await coverCropRectToPage(engine, imageBlock, crop, imageWidth, imageHeight);

  // Lock the crop ratio to the preset: crop-handle resizes keep this ratio.
  engine.block.setCropAspectRatioLocked(imageBlock, true);

  return engine.scene.saveToString();
}

/**
 * Align the image fill so the source image maps 1:1 onto the page while the
 * block's frame (the crop rectangle) windows the focal sub-region.
 *
 * Cover gives CE.SDK's normalized crop scales (non-overflow axis = 1, overflow
 * axis = imageDim/cropDim). Switching to Crop preserves them; we then set the
 * translation so the visible window starts at the crop rectangle's offset:
 *
 *   t = -(scale - 1) * (cropOffset / overflow)
 *
 * This is the proven `-(scale-1)*focal` form with the focal fraction replaced by
 * the clamped crop offset, which keeps the image edge-aligned to the page even
 * when the focal point is near an edge (so the whole image stays visible and the
 * crop is always fully covered).
 */
async function coverCropRectToPage(
  engine: CreativeEngine,
  block: number,
  crop: CropRect,
  imageW: number,
  imageH: number
): Promise<void> {
  // Cover's scale needs the image's natural size decoded first.
  await engine.block.forceLoadResources([block]);

  engine.block.setContentFillMode(block, 'Cover');
  const sx = engine.block.getCropScaleX(block);
  const sy = engine.block.getCropScaleY(block);

  engine.block.setContentFillMode(block, 'Crop');
  const overflowX = imageW - crop.w;
  const overflowY = imageH - crop.h;
  const tx = overflowX > 0 ? -(sx - 1) * (crop.x / overflowX) : 0;
  const ty = overflowY > 0 ? -(sy - 1) * (crop.y / overflowY) : 0;
  engine.block.setCropTranslationX(block, tx);
  engine.block.setCropTranslationY(block, ty);
}
```

- [ ] **Step 2: Syntax gate**

Run: `npm run check:syntax`
Expected: exits 0, no errors.

- [ ] **Step 3: Browser check — thumbnails**

Run the flow; Generate with a wide image and a 1:1 (and separately a 9:16) preset.
Expected: each thumbnail is a focal-framed crop at the preset aspect — equivalent framing to before the change (the subject centred via saliency), exported at the preset's pixel size.

- [ ] **Step 4: Browser check — editor view (the core visual)**

Click **Edit** on a tile.
Expected (matches the starter-kit screenshot):
- The **whole source image** is visible.
- A crop rectangle frames the focal region; the area **outside it is dimmed but rendered** (overflow).
- Dragging pans the image beneath the fixed rectangle; the crop is always fully covered.

If the image is NOT page-aligned (e.g. a gap of canvas appears on one side, or part of the image is cut at the page edge), the translation sign/fraction in `coverCropRectToPage` is the thing to inspect — verify `getCropScaleX/Y` returns the overflow-axis ratio (>1) and that `crop.x/overflowX ∈ [0,1]`. Capture a screenshot to compare against `docs/.../*-design.md`.

- [ ] **Step 5: Commit**

```bash
git add src/app/scene.ts
git commit -m "feat: scene = crop block on an image-sized page (photo-editor crop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Resizable, aspect-locked crop handles in the editor

**Files:**
- Modify: `src/app/crop-editor-config.ts` (show crop handles)
- Modify: `src/app/editor.ts` (defensive aspect-lock re-assert in `open()`)

- [ ] **Step 1: Show the crop handles in `src/app/crop-editor-config.ts`**

Change the crop-handle line (currently `engine.editor.setSettingBool('controlGizmo/showCropHandles', false);`) to `true`, and update its comment:

```ts
  // Show the crop resize handles. The frame stays at the preset aspect ratio
  // because the block has `setCropAspectRatioLocked(true)` (set in scene.ts) —
  // the engine keeps the ratio during handle resize. Coverage is clamped by
  // crop mode, so the image can never be resized/moved to expose emptiness.
  engine.editor.setSettingBool('controlGizmo/showCropHandles', true);
  // Keep scale handles so users can also scale the image within the frame.
  engine.editor.setSettingBool('controlGizmo/showCropScaleHandles', true);
```

- [ ] **Step 2: Re-assert the lock in `src/app/editor.ts` `open()`**

In `open()`, right after the `if (imageBlock == null) throw ...` guard (currently ~line 79) and before `await this.fitPage(page);`, add:

```ts
    // The lock is serialized in the scene string, but re-assert defensively so
    // crop-handle resizes always preserve the preset aspect ratio.
    engine.block.setCropAspectRatioLocked(imageBlock, true);
```

- [ ] **Step 3: Syntax gate**

Run: `npm run check:syntax`
Expected: exits 0, no errors.

- [ ] **Step 4: Browser check — resizable, ratio-locked, clamped**

Edit a tile. Verify all of:
- The crop rectangle has **resize handles**; dragging a handle resizes it **while keeping the preset ratio**.
- Dragging inside pans the image; the **scale handles** scale the image.
- You **cannot** drag or resize so the crop exposes empty space — it stays fully covered.
- No aspect-ratio picker / panel / dock appears (chrome still stripped).

- [ ] **Step 5: Commit**

```bash
git add src/app/crop-editor-config.ts src/app/editor.ts
git commit -m "feat: resizable aspect-locked crop frame in the editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: End-to-end verification + documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md`

- [ ] **Step 1: End-to-end flow check (before editing docs)**

Run the full loop: Upload → select 2–3 differently-shaped presets (e.g. 1:1, 9:16, 16:9) → Generate → Edit one tile (resize the crop + pan the image) → **Save** → confirm the tile updates → **Download all** → unzip.
Expected:
- Each PNG is exactly its preset's pixel size (e.g. `1080x1080`, `1080x1920`).
- The edited crop reflects the re-frame; the others are the saliency defaults.
- No console errors; no engine deadlock when Save's re-render and Download-all run back to back.

- [ ] **Step 2: Update `CLAUDE.md` gotcha #2**

Read `CLAUDE.md`. Replace gotcha **#2** (the "Cover crop math (the important one)" item and its sub-bullets) with:

```markdown
2. **Crop = a crop block on an image-sized page.** Each preset scene is: page
   sized to the *source image*, holding one image block whose **frame is the
   crop rectangle** — the largest preset-aspect rectangle that fits the image,
   centred on the focal point (`computeCropRect` in `scene.ts`). The image fill
   is aligned 1:1 to the page by `coverCropRectToPage`: force-load resources,
   read the `Cover` scales, switch to `Crop`, then
   `setCropTranslation = -(scale-1) * (cropOffset / overflow)` so the image maps
   image→page 1:1 and the block windows the focal region. The rest of the image
   shows as dimmed overflow in crop mode (engine-native). The renderer exports
   this block at preset px via `targetWidth/targetHeight`. (`scene.ts`,
   `renderer.ts`)
```

- [ ] **Step 3: Update `CLAUDE.md` gotcha #3**

Replace gotcha **#3** (the "No `ui/crop/*` engine settings in 1.76" item) with:

```markdown
3. **Resizable, aspect-locked crop frame.** The crop frame is the crop block's
   frame; it is **resizable** via crop handles (`controlGizmo/showCropHandles=true`)
   but ratio-locked by `setCropAspectRatioLocked(block, true)` on the block (the
   engine preserves the ratio during handle resize). Coverage is clamped
   automatically by crop mode — the image can never be moved/resized to expose
   emptiness, so no manual clamping is needed. There is still no `ui/crop/*`
   engine setting in this version; the aspect-ratio picker is omitted entirely.
   (`crop-editor-config.ts`, `scene.ts`)
```

- [ ] **Step 4: Update the `CLAUDE.md` source map rows**

Replace the `scene.ts`, `renderer.ts`, and `crop-editor-config.ts` rows of the "App source map" table with:

```markdown
| `src/app/scene.ts` | `buildPresetScene()` — image-sized page + a preset-aspect **crop block** framed at the focal point, fill aligned 1:1 to the page. **Crop-rect geometry (`computeCropRect`) lives here.** |
| `src/app/renderer.ts` | Headless engine lifecycle; `generateCrops`, `renderScene` (exports the **crop block** at preset px via `targetWidth/targetHeight`), `focalPointFor`; the **engine serialization mutex**. |
| `src/app/crop-editor-config.ts` | Strips the editor to crop-only (features off, UI regions emptied) and **shows the resizable crop handles** (ratio locked per-block). |
```

- [ ] **Step 5: Flip the spec status**

In `docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md`, change the Status line from `**Status:** Approved (pending written-spec review)` to `**Status:** Implemented`.

- [ ] **Step 6: Syntax gate**

Run: `npm run check:syntax`
Expected: exits 0 (docs-only changes; confirms nothing else drifted).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md
git commit -m "docs: update CLAUDE.md + spec for photo-editor-style crop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (for the implementer)

- **`coverCropRectToPage` is the one empirically-risky piece.** The geometry in `computeCropRect` is deterministic; the fill alignment relies on `getCropScaleX/Y` semantics. The translation form `-(scale-1)*fraction` is the same one the previous code used successfully — only the multiplier changed from the raw focal to the clamped crop offset. Task 2 Step 4 is where you confirm it on screen; if it's off, that function is the only place to adjust.
- **Coverage clamp / overflow are NOT implemented** — they are engine-native to crop mode. If they don't appear, the scene structure (block frame = crop rectangle, fill overflowing it) is wrong, not a missing setting.
- **Why no page clip:** `setClipped(page, false)` keeps the dimmed overflow visible during pan/zoom. Export is unaffected (it renders the block, not the page).
- **Signature consistency:** `renderScene(sceneString, targetWidth, targetHeight)` — all three call sites (generateCrops, download.ts, index.ts) pass width then height; `CropResult` carries `width`/`height` and `Preset` carries `width`/`height`.
