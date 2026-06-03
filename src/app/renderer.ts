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
