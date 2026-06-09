/**
 * Builds a per-preset scene the way the photo-editor starter kit does: the PAGE
 * itself is the crop. The page is sized to the preset, and the source image is
 * the page's content fill, cropped (Cover scale + a focal-point translation) so
 * the salient region is framed. Because the page IS the crop frame, CE.SDK's
 * native crop tool behaves correctly — the frame is centered, the image always
 * covers it, and there is no larger page to expose. The renderer exports the
 * page at the preset's exact pixels (see renderer.ts).
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

/**
 * Build the scene in `engine` and return its serialized string. The image's
 * pixel dimensions aren't needed: the page is the preset size and the focal
 * framing uses the engine's normalized Cover scales (read after the image
 * decodes), so `_imageWidth`/`_imageHeight` are accepted only to keep the
 * renderer's call signature stable.
 *
 * @returns the serialized scene string for the built scene.
 */
export async function buildPresetScene(
  engine: CreativeEngine,
  imageURI: string,
  _imageWidth: number,
  _imageHeight: number,
  preset: PresetSize,
  focalPoint: FocalPoint | null
): Promise<string> {
  // A fresh headless scene contains only the scene + camera (no stack block,
  // and stacks can't be created directly), so the page is appended straight to
  // the scene block, which `create()` returns.
  const scene = engine.scene.create();

  // The PAGE is the crop: sized to the preset output, with the source image as
  // its content fill. The crop frame == the page, so it stays centered and the
  // image can never slide off to expose emptiness (unlike a sub-window block).
  const page = engine.block.create('//ly.img.ubq/page');
  engine.block.setWidth(page, preset.width);
  engine.block.setHeight(page, preset.height);
  engine.block.appendChild(scene, page);

  const fill = engine.block.createFill('//ly.img.ubq/fill/image');
  engine.block.setString(fill, 'fill/image/imageFileURI', imageURI);
  engine.block.setFill(page, fill);

  // engine.block.setEnum(page, 'contentFill/mode', 'Crop');

  await frameFocalRegion(engine, page, focalPoint);

  return engine.scene.saveToString();
}

/**
 * Crop the page's image fill so the salient region is framed. Cover gives
 * CE.SDK's normalized crop scales (non-overflow axis = 1, overflow axis =
 * imageDim/pageDim); switching to Crop preserves them, then the translation
 * frames the focal point:
 *
 *   t = -(scale - 1) * focalFraction      (focalFraction in [0,1])
 *
 * the proven `-(scale-1)*focal` form. A focal fraction in [0,1] keeps the image
 * fully covering the page on each axis, so the crop is always covered (on the
 * non-overflow axis scale == 1, so t == 0).
 */
async function frameFocalRegion(
  engine: CreativeEngine,
  block: number,
  focal: FocalPoint | null
): Promise<void> {
  // Cover's scale needs the image's natural size decoded first.
  await engine.block.forceLoadResources([block]);

  engine.block.setContentFillMode(block, 'Cover');
  const sx = engine.block.getCropScaleX(block);
  const sy = engine.block.getCropScaleY(block);

  engine.block.setContentFillMode(block, 'Crop');
  const fx = focal?.x ?? 0.5;
  const fy = focal?.y ?? 0.5;
  engine.block.setCropTranslationX(block, -(sx - 1) * fx);
  engine.block.setCropTranslationY(block, -(sy - 1) * fy);
}
