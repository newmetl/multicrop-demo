/**
 * Bundle every generated crop into a single ZIP and trigger one download.
 * Each crop is freshly re-rendered from its canonical scene string so the ZIP
 * always reflects the latest edits (not the possibly-stale thumbnail).
 *
 * @see https://github.com/Touffy/client-zip
 */

import { downloadZip } from 'client-zip';

import { renderScene } from './renderer';
import type { CropResult } from './state';

/** Filesystem-safe file name for a crop, e.g. "instagram-story-1080x1920.png". */
function fileNameFor(result: CropResult): string {
  const slug = result.presetLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${slug}-${result.width}x${result.height}.png`;
}

/** Re-render all results, zip them, and trigger a browser download. */
export async function downloadAll(results: CropResult[]): Promise<void> {
  // Render sequentially: renderScene loads each scene into the SHARED headless
  // engine and exports it, so concurrent calls (Promise.all) would race on the
  // single engine's scene state and deadlock. One at a time is required.
  const files: { name: string; input: Blob }[] = [];
  for (const result of results) {
    files.push({
      name: fileNameFor(result),
      input: await renderScene(result.sceneString)
    });
  }

  const zipBlob = await downloadZip(files).blob();
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'multicrop-export.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
