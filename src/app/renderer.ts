/**
 * Headless renderer: a single `@cesdk/engine` CreativeEngine instance used to
 * build per-preset scenes (Task 4) and to render any scene string to a PNG
 * Blob. It is the only component that produces pixels; the editor only edits
 * crop transforms and hands scene strings back here to re-render.
 *
 * @see https://img.ly/docs/cesdk/node/conversion/to-png-f1660c/
 */

import CreativeEngine from '@cesdk/engine';
import { buildPresetScene } from './scene';
import { computeFocalPoint, type FocalPoint } from './saliency';
import type { Preset } from './presets';
import type { CropResult } from './state';

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
