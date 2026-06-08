/**
 * In-memory app state for MultiCrop. No persistence — a reload starts fresh.
 *
 * The canonical representation of each generated crop is its serialized
 * single-page scene string. Thumbnails are derived (re-rendered) artifacts.
 */

export interface CropResult {
  /** Stable id — the preset's asset id. */
  id: string;
  /** Human-readable label, e.g. "Instagram Story". */
  presetLabel: string;
  /** Preset width in pixels (used as the export targetWidth). */
  width: number;
  /** Preset height in pixels (used as the export targetHeight). */
  height: number;
  /** Serialized single-page scene (source of truth for this crop). */
  sceneString: string;
  /** Object URL of the latest rendered PNG (revoke before replacing). */
  thumbnailUrl: string;
}

export interface AppState {
  /** Object URL of the uploaded image, kept alive for the whole session. */
  sourceURI: string | null;
  /** Natural pixel dimensions of the uploaded image. */
  sourceWidth: number;
  sourceHeight: number;
  /** One result per selected preset, in selection order. */
  results: CropResult[];
}

export const state: AppState = {
  sourceURI: null,
  sourceWidth: 0,
  sourceHeight: 0,
  results: []
};

/** Find a result by id, or undefined. */
export function findResult(id: string): CropResult | undefined {
  return state.results.find((r) => r.id === id);
}

/** Replace a result's thumbnail, revoking the previous object URL. */
export function setThumbnail(result: CropResult, url: string): void {
  if (result.thumbnailUrl) URL.revokeObjectURL(result.thumbnailUrl);
  result.thumbnailUrl = url;
}

/** Remove a result by id, revoking its thumbnail URL. Returns true if removed. */
export function removeResult(id: string): boolean {
  const index = state.results.findIndex((r) => r.id === id);
  if (index === -1) return false;
  const [removed] = state.results.splice(index, 1);
  if (removed.thumbnailUrl) URL.revokeObjectURL(removed.thumbnailUrl);
  return true;
}

/** Remove every result, revoking all thumbnail URLs. */
export function clearAllResults(): void {
  for (const r of state.results) {
    if (r.thumbnailUrl) URL.revokeObjectURL(r.thumbnailUrl);
  }
  state.results = [];
}
