/**
 * Multicrop Saliency
 *
 * Computes a per-image focal point by running the same background-removal
 * model the project already ships (@imgly/background-removal). The alpha
 * channel of the result is treated as a foreground mask. The focal point's
 * X is the alpha-weighted centroid (the subject's horizontal center of mass);
 * its Y is biased upward from the center of mass toward the top of the subject
 * so a person's face stays in frame on wide/short crops instead of being cut
 * off. Coordinates are normalized fractions of the image, in [0, 1].
 *
 * Results are cached per URI as a Promise so concurrent callers share
 * a single inference, and repeated calls return immediately.
 *
 * Returns `null` when the mask is degenerate (almost-empty or almost-full)
 * — those cases mean bg-removal didn't find a clear subject, so the caller
 * should fall back to geometric centering.
 *
 * Cost note: `@imgly/background-removal` is backed by `onnxruntime-web`, whose
 * WASM binary is ~24 MB and dominates the production bundle. This module is the
 * only thing that pulls it in — drop it (and those two dependencies) if you
 * don't need subject-aware cropping; `createCroppedPage` accepts a `null` focal
 * point and centers the crop geometrically with no model involved.
 *
 * @see https://www.npmjs.com/package/@imgly/background-removal
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';
import { removeBackground } from '@imgly/background-removal';

type Engine = CreativeEditorSDK['engine'];

export interface FocalPoint {
  /**
   * X position as a fraction of the image width, in [0, 1]. Normalized (rather
   * than in pixels) so it's independent of the mask resolution and of the
   * source block's size — an uploaded image whose block isn't sized to its
   * natural pixels still maps correctly.
   */
  x: number;
  /** Y position as a fraction of the image height, in [0, 1]. */
  y: number;
}

// Cache by URI. Stores the in-flight Promise so concurrent callers share
// the same inference. Cleared only if explicitly invalidated (not yet).
const cache = new Map<string, Promise<FocalPoint | null>>();

/**
 * Compute a focal point for the image at `imageUri`, or `null` if the
 * mask is degenerate / inference fails. Cached per URI.
 */
export function computeFocalPoint(
  imageUri: string,
  engine: Engine
): Promise<FocalPoint | null> {
  const cached = cache.get(imageUri);
  if (cached != null) return cached;

  const pending = runInference(imageUri, engine).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Multicrop saliency: inference failed', error);
    return null;
  });
  cache.set(imageUri, pending);
  return pending;
}

async function runInference(
  imageUri: string,
  engine: Engine
): Promise<FocalPoint | null> {
  const blob = await uriToBlob(imageUri, engine);
  // device: 'gpu' picks the WebGPU execution provider when the browser
  // supports it; @imgly/background-removal then runs inference inside a
  // Web Worker (proxyToWorker: true) so the main thread stays
  // responsive. On browsers without WebGPU the library falls back to
  // main-thread WASM transparently — same behavior as the defaults, no
  // regression.
  const maskedBlob = await removeBackground(blob, {
    device: 'gpu',
    proxyToWorker: true
  });
  return centroidFromAlpha(maskedBlob);
}

/**
 * Engine's buffer:// URIs need to be read out via the editor API; other
 * URIs (http(s)://, blob:, data:) can be passed straight through.
 */
async function uriToBlob(uri: string, engine: Engine): Promise<string | Blob> {
  if (uri.startsWith('buffer://')) {
    const mimeType = await engine.editor.getMimeType(uri);
    const bufferLength = engine.editor.getBufferLength(uri);
    const bufferData = engine.editor.getBufferData(uri, 0, bufferLength);
    return new Blob([bufferData as BlobPart], { type: mimeType });
  }
  return uri;
}

// How far to pull the vertical focal point from the subject's center of mass
// up toward the top of the subject (0 = center of mass, 1 = top of head).
// The alpha-weighted centroid sits at the subject's center of mass — roughly
// the torso for a standing person — which pushes the head off the top edge on
// wide/short crops. Biasing upward keeps the head/face anchored.
//
// 0.8 was chosen by testing across a range of subjects (frontal portraits,
// profiles, people shot from behind, action shots): it reliably lands on the
// head. Erring high is deliberate — a focal point slightly above the head
// keeps the whole head in frame, whereas too low (e.g. 0.65) leaves it on the
// neck and risks cropping the face off the top on wide formats.
const VERTICAL_HEAD_BIAS = 0.8;

// Fraction of the subject's mass to ignore when locating its "top", so a thin
// protrusion (stray hair, a raised hand, a ponytail) doesn't drag the focal
// point above the head. The top is the row above which only this fraction of
// the solid-foreground pixels lie.
const TOP_IGNORE_FRACTION = 0.02;

// Alpha at/above which a pixel counts as solid foreground (vs. a soft mask
// edge or faint hair wisp). Used for coverage and for locating the top.
const SOLID_ALPHA = 128;

/**
 * Decode the masked image, walk its alpha channel, and return a focal point:
 * the alpha-weighted centroid horizontally, biased upward toward the top of
 * the subject vertically (see `VERTICAL_HEAD_BIAS`) so faces aren't cropped
 * out. Returns `null` if the mask covers less than 5% or more than 95% of the
 * image — both are signals that bg-removal didn't find a meaningful subject.
 */
async function centroidFromAlpha(
  maskedBlob: Blob
): Promise<FocalPoint | null> {
  const bitmap = await createImageBitmap(maskedBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (ctx == null) return null;
  ctx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  const { data } = ctx.getImageData(0, 0, width, height);

  const totalPixels = width * height;
  let alphaSum = 0;
  let weightedX = 0;
  let weightedY = 0;
  let foregroundCount = 0;
  // Count of solid-foreground pixels per row, used to find a robust "top".
  const solidPerRow = new Float64Array(height);

  // data is RGBA, so step by 4. Index → (x, y).
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const x = p % width;
    const y = (p - x) / width;
    alphaSum += alpha;
    weightedX += x * alpha;
    weightedY += y * alpha;
    if (alpha >= SOLID_ALPHA) {
      foregroundCount += 1;
      solidPerRow[y] += 1;
    }
  }

  if (alphaSum === 0 || foregroundCount === 0) return null;

  const coverage = foregroundCount / totalPixels;
  if (coverage < 0.05 || coverage > 0.95) return null;

  const centroidX = weightedX / alphaSum;
  const centroidY = weightedY / alphaSum;

  // Locate the top of the subject, ignoring the topmost sliver of mass so
  // stray protrusions don't skew it, then bias the vertical focal point from
  // the center of mass up toward that top.
  const topY = findSubjectTop(solidPerRow, foregroundCount);
  const focalY = centroidY - VERTICAL_HEAD_BIAS * (centroidY - topY);

  // Normalize to fractions of the image so the result is independent of the
  // mask resolution (and therefore of the source block's size).
  return { x: centroidX / width, y: focalY / height };
}

/**
 * Return the y (row) marking the top of the subject: the first row, scanning
 * from the top, at which the cumulative solid-foreground mass exceeds
 * `TOP_IGNORE_FRACTION` of the total. This skips thin protrusions above the
 * head (stray hair, a raised hand) that the absolute topmost pixel would catch.
 */
function findSubjectTop(
  solidPerRow: Float64Array,
  foregroundCount: number
): number {
  const threshold = foregroundCount * TOP_IGNORE_FRACTION;
  let cumulative = 0;
  for (let y = 0; y < solidPerRow.length; y += 1) {
    cumulative += solidPerRow[y];
    if (cumulative > threshold) return y;
  }
  return 0;
}
