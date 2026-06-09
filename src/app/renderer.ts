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
import { CESDK_LICENSE, CESDK_USER_ID } from './license';

let enginePromise: Promise<CreativeEngine> | null = null;

/** Lazily initialize (once) and return the shared headless engine. */
export function getRenderEngine(): Promise<CreativeEngine> {
  if (enginePromise == null) {
    enginePromise = CreativeEngine.init({
      baseURL: `https://cdn.img.ly/packages/imgly/cesdk-engine/${CreativeEngine.version}/assets`,
      ...(CESDK_LICENSE
        ? { license: CESDK_LICENSE, userId: CESDK_USER_ID }
        : {})
    });
  }
  return enginePromise;
}

// The headless engine holds a single scene at a time: each operation does
// loadFromString/saveToString + export, mutating shared state. Concurrent
// operations (e.g. a Save's re-render overlapping a Download-all, or two
// Download-all clicks) would interleave loadFromString calls and race — the
// same hazard the per-item sequential loops avoid, but across operations. This
// promise-chain serializes every engine-touching critical section so they can
// never overlap, regardless of how the UI is clicked.
let engineLock: Promise<unknown> = Promise.resolve();

function withEngine<T>(critical: () => Promise<T>): Promise<T> {
  const run = engineLock.then(critical, critical);
  // Keep the chain alive even if a critical section throws.
  engineLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** The crop is the page itself (its image fill is cropped to the preset). */
function findCropBlock(engine: CreativeEngine): number {
  const page = engine.block.findByType('page')[0];
  if (page == null) throw new Error('renderScene: scene has no page');
  return page;
}

/**
 * Render a serialized scene's page to a PNG Blob at the preset's exact pixel
 * size. The page IS the crop (preset-sized, image as its cropped content fill);
 * `targetWidth/targetHeight` give the exact output pixels (a non-distorting
 * resize, since the page is already the preset aspect). Serialized against all
 * other engine ops.
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

/** Compute the focal point for the source image once (cached in saliency.ts). */
export async function focalPointFor(imageURI: string): Promise<FocalPoint | null> {
  const engine = await getRenderEngine();
  // saliency only uses the engine for buffer:// URIs; object URLs pass through.
  return computeFocalPoint(imageURI, engine);
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
    // Building mutates the shared engine's scene, so it runs inside the same
    // lock as renderScene (which is itself serialized). Each is a self-contained
    // critical section, so interleaving at their boundaries is safe.
    const sceneString = await withEngine(() =>
      buildPresetScene(
        engine,
        imageURI,
        imageWidth,
        imageHeight,
        preset,
        focalPoint
      )
    );
    const blob = await renderScene(sceneString, preset.width, preset.height);
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
