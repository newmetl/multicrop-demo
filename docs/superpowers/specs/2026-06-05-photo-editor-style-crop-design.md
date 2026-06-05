# MultiCrop — Photo-Editor-Style Crop Editor (Design)

**Date:** 2026-06-05
**Status:** Implemented
**Supersedes:** the crop behavior in `2026-06-03-multicrop-social-sizes-design.md`
(point 7: "crop rectangle locked to the preset size, pan/scale the image only").

## Goal

Make the in-modal crop editor behave like **CE.SDK's native crop tool** — the
same experience as the IMG.LY Photo Editor starter kit
(`/Users/wojtek/Development/img.ly/starterkit-photo-editor-ts-web`). Concretely:

1. The **whole source image** is visible, with the area outside the crop
   rectangle **dimmed but rendered** (the "overflow").
2. The crop rectangle's **aspect ratio is locked to the selected preset**.
3. The crop rectangle is **resizable (ratio-locked) and repositionable**, and the
   image can be panned/scaled — full photo-editor parity.
4. The crop is **always fully covered** by the image (you can never drag or
   resize it to expose emptiness).
5. On drag, the image pans beneath a crop rectangle that stays fixed on screen
   (confirmed as the starter-kit behavior).

### Why this is mostly a restructure, not new logic

CE.SDK's crop **edit mode** already provides items 1, 4, and the aspect-lock for
free:

- A block's **frame is the crop rectangle**; its **image fill** carries a crop
  transform (`cropScaleX/Y`, `cropTranslationX/Y`, the latter stored *as a
  percentage of the frame size* — `index.d.ts` `getCropTranslationX`).
- In crop mode the engine renders the **entire fill**, dimming whatever lies
  outside the frame. That is the "overflow" — it is intrinsic to crop mode, not a
  property of the page.
- Coverage is **clamped automatically**: the translation is bounded to
  `t ∈ [-(scale-1), 0]` per axis and scale is floored at "cover," so the frame can
  never leave the image. The explicit API form is
  `adjustCropToFillFrame(block, minScaleRatio)` ("adjusts the crop position and
  scale to fill its crop frame, while maintaining the position and size of the
  crop frame").
- `setCropAspectRatioLocked(block, true)` makes crop-handle resizes preserve the
  current ratio.

The current editor already enters crop mode, so it already has the clamp and the
overflow primitive. The only reason the overflow isn't *seen* is structural:
`page = preset`, the single block **fills** that page, and the editor fits the
page to the viewport — so the fill's extent (the whole image) is pushed past the
page edge / off-screen.

## Architecture change — "crop block on an image-sized page"

The canonical state stays **one serialized scene string per preset**
(`CropResult.sceneString`). Only the scene's internal shape and the export target
change.

| | Today | New |
| --- | --- | --- |
| Page size | `preset.width × preset.height` | `sourceWidth × sourceHeight` (the whole image) |
| The block | fills the page (= preset) | frame **is the crop rectangle** — a preset-aspect sub-region of the page |
| Image fill | cover-cropped to the preset frame | rendered ~1:1 with the page, so the whole image shows; the crop block is a window into it |
| What renders | `engine.block.export(page)` at native size | `engine.block.export(cropBlock, { targetWidth, targetHeight })` at the preset's exact pixels |

`targetWidth/targetHeight` (confirmed in `ExportOptions`, `index.d.ts:8401`)
guarantees exact preset pixels regardless of the crop rectangle's size in scene
units — so a resizable crop rectangle still exports at, e.g., 1080×1080.

### Scene geometry (the certain part)

Scene unit = 1 source pixel, so `page = sourceWidth × sourceHeight`. The crop
rectangle is the **largest preset-aspect rectangle that fits inside the image**,
positioned at the saliency focal point:

```
presetAspect = preset.width / preset.height
imageAspect  = sourceWidth / sourceHeight

if imageAspect > presetAspect:      // image wider than the crop → full height
  cropH = sourceHeight
  cropW = sourceHeight * presetAspect
else:                               // image taller/narrower → full width
  cropW = sourceWidth
  cropH = sourceWidth / presetAspect

fx = focalPoint?.x ?? 0.5           // normalized over the image
fy = focalPoint?.y ?? 0.5
cropX = clamp(fx * sourceWidth  - cropW / 2, 0, sourceWidth  - cropW)
cropY = clamp(fy * sourceHeight - cropH / 2, 0, sourceHeight - cropH)
```

Because one dimension of the crop rectangle always equals the full image
dimension, covering it leaves the image at ~1:1 scale — i.e. the whole image is
shown at native resolution, with the crop rectangle as a sub-window and the rest
of the image as dimmed overflow. This is exactly the starter-kit look.

### The fill-mapping (the part to verify live)

The one genuinely uncertain piece is the API sequence that makes the image fill
render ~1:1 with the page *while the block frame is the smaller crop rectangle*.
Two candidate strategies, to be settled by live browser checks:

- **Strategy A (preferred — simplest):** create the block with frame = full page
  `(0, 0, sourceWidth, sourceHeight)` and an identity crop (image fills block =
  page 1:1), switch `contentFillMode` to `'Crop'` to fix the transform, then
  resize/move the block frame to `(cropX, cropY, cropW, cropH)`. This works **iff
  resizing the frame in Crop mode preserves the fill's world position** (does not
  re-cover).
- **Strategy B (fallback):** keep the existing `frameToFocalPoint` approach
  (`forceLoadResources` → read `Cover` scales → switch to `Crop` →
  `setCropTranslationX/Y = -(scale-1)*focal`) but applied to a block whose frame
  is the crop rectangle. The cover+focal math is unchanged; only the frame size
  differs.

Either way the end-state is identical and must be confirmed on screen: whole
image visible, crop rectangle framing the focal region, image fully covering it.

## Component changes

- **`src/app/scene.ts`** — `buildPresetScene`: `page = sourceWidth × sourceHeight`
  (append to the scene block, per the no-stack gotcha). Create the image block,
  set its frame to the crop rectangle from the geometry above, map the fill ~1:1
  to the page (Strategy A or B), and `setCropAspectRatioLocked(block, true)`.
  Replace today's `frameToFocalPoint` cover-fill translation with frame placement
  (or adapt it per Strategy B).
- **`src/app/renderer.ts`** — `renderScene`: locate the **crop block** (the
  croppable graphic, e.g. via `findByType('//ly.img.ubq/graphic')[0]` /
  `supportsCrop`) instead of the page, and export it with
  `{ mimeType: 'image/png', targetWidth: preset.width, targetHeight: preset.height }`.
  Needs the preset dimensions at render time — thread them through (they're on
  `CropResult`/`Preset`). `generateCrops` and `download.ts` inherit the change.
  The `withEngine` serialization mutex is untouched.
- **`src/app/crop-editor-config.ts`** — stop locking the frame: **show crop
  handles** (`controlGizmo/showCropHandles = true`) alongside the scale handles;
  set `page/restrictResizeInteractionToFixedAspectRatio = true` and rely on
  `setCropAspectRatioLocked`. Keep the chrome stripped (no panels/dock/inspector,
  no aspect-ratio picker, crop-panel auto-open still disabled). Keep
  `dimOutOfPageAreas` and `highlightWhenCropping`.
- **`src/app/editor.ts`** — `open()`: select the crop block, enter Crop mode, fit
  the **page** (= whole image) to the viewport so the image + crop rectangle +
  overflow are all visible. `save()` serializes as before.
- **`src/app/state.ts` / `src/app/ui.ts` / `src/index.ts`** — contract unchanged.
  `CropResult` keeps `width`/`height`/`sceneString`/`thumbnailUrl`; gallery
  thumbnails still come from `renderScene` at preset pixels, so the
  uniform-grid/relative-size layout still holds.

## Data flow (shape unchanged)

Upload → focal point → `generateCrops` builds one scene per preset + a thumbnail
→ gallery → **Edit** loads the scene in the modal crop editor → re-frame → **Save**
serializes the scene back → tile re-rendered via `renderScene` → **Download all**
re-renders every scene → one ZIP. Object-URL lifetime rules (§7 of CLAUDE.md) are
unaffected: the `blob:` source URI is still kept alive for the session and
referenced by every scene string.

## Risks & verification

No automated tests (project policy). Verification is `npm run check:syntax` plus
manual browser checks:

1. **Fill-mapping correctness (primary risk).** Build a scene, open the editor,
   screenshot. Confirm: whole image visible, crop rectangle framing the focal
   region, dimmed overflow on the overflow axis. Tune Strategy A vs B until it
   matches the starter kit.
2. **Coverage during interaction.** Resize the (ratio-locked) crop rectangle and
   pan/scale the image; confirm the crop can never expose emptiness and the ratio
   never changes.
3. **Export fidelity.** Save, then confirm the re-rendered tile and the
   downloaded PNG are exactly `preset.width × preset.height` and show precisely
   the framed region.
4. **Regression.** Generate → edit → save → download-all still works end to end;
   the engine mutex still serializes overlapping renders.

## Out of scope

- No aspect-ratio picker (ratio is fixed per preset), no rotation/flip UI, no
  persistence.
- The dead `photo-editor/**` and `src/imgly/**` starter-kit code stays untouched.

## Follow-up

Update `CLAUDE.md` as part of the work — it documents three decisions this design
revises:

- **#2 (cover-crop fill math):** the crop is now expressed as a crop-block frame
  on an image-sized page, not a cover-fill translation on a page-sized block.
- **#3 & #4 (locked, handle-less frame):** the frame is now a **resizable,
  aspect-locked** crop rectangle with crop handles shown.

Also update the architecture/source-map notes (renderer exports the crop block,
not the page) and the editor flow description.
