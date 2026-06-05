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

  await frameToFocalPoint(engine, imageBlock, focalPoint);

  return engine.scene.saveToString();
}

/**
 * Cover the frame (aspect-preserving, no distortion) and bias the visible
 * region toward the focal point.
 *
 * The image is force-loaded first so its natural size is known, then `Cover`
 * computes the correct aspect-preserving crop scale (`sx`, `sy`) — in CE.SDK's
 * normalized crop space, the non-overflowing axis is 1 and the overflowing axis
 * is `frameAspect/imageAspect` (or its inverse). Switching to `Crop` preserves
 * those scales; we then set the translation directly in that space:
 *
 *   tx = -(sx - 1) * focalX,  ty = -(sy - 1) * focalY
 *
 * At focal 0.5 this equals Cover's centered translation `-(s-1)/2`; at 0 it
 * shows the top/left edge, at 1 the bottom/right — always within the
 * fully-covered range, so there are never empty bars and the image is never
 * stretched. With no focal point we center (0.5, 0.5).
 */
async function frameToFocalPoint(
  engine: CreativeEngine,
  block: number,
  focalPoint: FocalPoint | null
): Promise<void> {
  // Cover's scale depends on the image's natural dimensions, so the resource
  // must be decoded before we read the scale back.
  await engine.block.forceLoadResources([block]);

  engine.block.setContentFillMode(block, 'Cover');
  const sx = engine.block.getCropScaleX(block);
  const sy = engine.block.getCropScaleY(block);

  // Switch to manual control (preserves the Cover scales) and position the
  // covered image toward the focal point.
  engine.block.setContentFillMode(block, 'Crop');
  const fx = focalPoint?.x ?? 0.5;
  const fy = focalPoint?.y ?? 0.5;
  engine.block.setCropTranslationX(block, -(sx - 1) * fx);
  engine.block.setCropTranslationY(block, -(sy - 1) * fy);
}
