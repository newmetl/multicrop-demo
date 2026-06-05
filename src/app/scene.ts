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
