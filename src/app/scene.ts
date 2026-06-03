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
 * @returns the serialized scene string for the built single-page scene.
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
  // the scene block, which `create()` returns. `engine.scene.getPages()` still
  // recognizes a page parented to the scene this way.
  const scene = engine.scene.create();

  const page = engine.block.create('//ly.img.ubq/page');
  engine.block.setWidth(page, preset.width);
  engine.block.setHeight(page, preset.height);
  engine.block.setClipped(page, true);
  engine.block.appendChild(scene, page);

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

  return engine.scene.saveToString();
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
    // Image is wider than frame -> horizontal overflow. Fraction of the image
    // that overflows the frame width (total, both sides):
    const overflow = 1 - frameAspect / imageAspect;
    // Move focal point to center: shift by (0.5 - focalX) of the image width;
    // expressed as a fraction of the frame, clamped to +/- overflow:
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
