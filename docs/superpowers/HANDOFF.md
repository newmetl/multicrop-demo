# MultiCrop — Session Handoff (2026-06-05)

**Branch:** `multicrop-app` · **Remote:** `origin`
(`git@github.com:newmetl/multicrop-demo.git`) — everything below is **committed and
pushed**. No PR. Note: `main` contains *none* of the demo — the whole project lives
on `multicrop-app`, so a PR/merge to `main` would be the entire demo, not one feature.

> Read `CLAUDE.md` first — it has the architecture, source map, and the
> hard-won gotchas (kept current). This file is the session-continuity layer:
> what just happened, what's verified, and how to pick up.

## Status: photo-editor-style crop rework — COMPLETE

The in-modal crop editor now behaves like CE.SDK's native crop tool: the whole
source image is visible with the area outside the crop rectangle **dimmed**
(overflow), the crop rectangle is **resizable but ratio-locked** to the preset, and
the crop is **always fully covered** (engine-native clamp).

- Spec: `docs/superpowers/specs/2026-06-05-photo-editor-style-crop-design.md`
- Plan: `docs/superpowers/plans/2026-06-05-photo-editor-style-crop.md`
- Decisions folded into `CLAUDE.md` gotchas **#2** (crop block on an image-sized
  page), **#3** (resizable aspect-locked frame), **#6** (first-open mount resets
  edit mode → guard).

### Commits this session (on top of `9c3b53d`)

```
cde0ac0 docs: refresh stale comments after the crop rework
ebc8ffc docs: update CLAUDE.md + spec for photo-editor-style crop
1b10ff8 fix: hold Crop mode against the first-open canvas-mount reset
c8af2fc feat: resizable aspect-locked crop frame in the editor
3266636 feat: scene = crop block on an image-sized page (photo-editor crop)
31d2457 refactor: render the crop block at preset px via targetWidth/targetHeight
00913eb docs: implementation plan for photo-editor-style crop
5994122 docs: spec for photo-editor-style crop editor
```

### What changed (file-level)

- **`scene.ts`** — `buildPresetScene` now builds: page = **source-image size**; one
  image block whose **frame is the crop rectangle** (largest preset-aspect rect that
  fits, centred on the focal point); fill mapped ~1:1 to the page. New helpers
  `computeCropRect` (geometry) + `coverCropRectToPage` (fill alignment via
  `-(scale-1)*(cropOffset/overflow)`). `setCropAspectRatioLocked(block, true)`. The
  old `frameToFocalPoint` is gone.
- **`renderer.ts`** — `renderScene(sceneString, targetWidth, targetHeight)` exports
  the **crop block** (via `findCropBlock`) at preset px. All 3 callers updated
  (`generateCrops`, `download.ts`, `index.ts`). Engine mutex unchanged.
- **`crop-editor-config.ts`** — `controlGizmo/showCropHandles=true` (resizable;
  ratio held by the per-block lock).
- **`editor.ts`** — `enterCropMode()` enters Crop and installs an
  `engine.editor.onStateChanged` guard that re-asserts Crop if the editor leaves it
  while the modal is open; torn down in `save()`/`hide()`.

## Verification status (evidence-based)

**Verified live** (preview tool at localhost:5173, with a synthetic 1600×900 test
image):
- Thumbnails render at exact preset px (1080×1080 and 1080×1920).
- Editor shows the full image with **dimmed overflow** + a focal-framed crop
  rectangle that **persists** ~2.5s past the mount reset (screenshot-confirmed).
- **Save** re-renders the tile (1080×1080, no error); **Download-all** runs clean.
- `npm run check:syntax` green throughout.

**Left for a hands-on pass** (verified only at engine-config level — `aspectLocked`
true, handles shown — not by simulating pointer drags):
- Resizing the crop rectangle (ratio must stay locked to the preset).
- Dragging/scaling the image (must never expose empty edges).
- The 9:16 editor view *after* the crop-mode fix (the fix is aspect-agnostic; the
  9:16 *thumbnail* was verified).

## How to run & verify (reusable recipe)

- `npm install`; `npm run dev` → http://localhost:5173. **Cold start ~60–90s** in
  throttled/headless preview (two CE.SDK engines from CDN + a ~24 MB ONNX model);
  much faster with warm caches. `.claude/launch.json` defines `multicrop-dev`.
- `npm run check:syntax` (`tsc --noEmit`) is the **only** automated gate. **No test
  suite** — intentional for this demo. Verification = check:syntax + browser.
- **Driving the app headlessly** (preview_eval) — the hidden file input accepts a
  programmatic upload:
  ```js
  // build/fetch a Blob, then:
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'test.png', { type: 'image/png' }));
  const input = document.getElementById('file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // then: click a preset checkbox (by label text) + #generate-btn;
  // tiles are <img src="blob:...">; Edit buttons open #editor-modal;
  // #download-all-btn triggers the ZIP.
  ```
  A **synthetic canvas image** with quadrant labels + an off-center marker makes crop
  placement and overflow unambiguous to verify. (`public/assets/remove-bg.png` is
  served but only 160×160.)
- The editor's `cesdk`/`engine` is **not** global. To inspect engine state, briefly
  add `(globalThis as any).__ed = { engine, page, imageBlock }` at the end of
  `editor.open()`, drive the flow, read it, then revert. The editor canvas lives in
  a **shadow root** (so `document.querySelectorAll('canvas')` finds nothing — use a
  screenshot to see it).

## Key discovery (so you don't re-debug it)

On the **first** editor open, the WebGL canvas mounts a few frames after `open()`
runs and **resets `editMode` Crop→Transform**. With the new sub-region crop block,
Transform mode hides the dimmed overflow and shows the bare white page. Timeline
(measured): editMode was `Crop` through the first animation frame, `Transform` by
~100 ms. Fixed by the `onStateChanged` guard. The old `block = page` scene masked
this (Transform vs Crop looked identical). See `CLAUDE.md` gotcha #6.

## Environment notes

- No license key → exports carry the CE.SDK **trial watermark**; the
  `[Evaluation Purposes Only]` banner is logged to the console **as errors** —
  expected noise, ignore it.
- No persistence; reload = fresh start. Object URLs (`state.sourceURI`, thumbnails)
  are managed manually (see gotcha #7).

## Candidate next steps (nothing committed-to)

- The hands-on feel-check above.
- Optionally screenshot a couple more preset aspects in-editor for confidence.
- Whatever new task you bring — this handoff + `CLAUDE.md` should fully onboard a
  fresh session.
