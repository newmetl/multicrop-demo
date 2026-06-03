/**
 * Loads social-media page-format presets from CE.SDK's `PagePresetsAssetSource`
 * (asset source `ly.img.page.presets`), grouped by platform for the checkbox
 * list. Print and generic-video preset groups are intentionally excluded.
 *
 * Adapted from multicrop-demo-1/src/imgly/plugins/multicrop/presets.ts.
 *
 * @see https://img.ly/docs/cesdk/js/asset-management/overview/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export type CategoryId =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'pinterest';

/** Display order of platform groups in the checkbox list. */
export const CATEGORY_ORDER: CategoryId[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'pinterest'
];

/** Human-readable group headings. */
export const CATEGORY_LABEL: Record<CategoryId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
  pinterest: 'Pinterest'
};

export interface Preset {
  /** Stable asset id; used as the checkbox key + CropResult id. */
  id: string;
  /** Human-readable label, e.g. "Instagram Story". */
  label: string;
  width: number;
  height: number;
}

export type PresetsByCategory = Partial<Record<CategoryId, Preset[]>>;

const PAGE_PRESETS_SOURCE = 'ly.img.page.presets';

// Asset-group → category. Groups not listed here (print, video, etc.) are
// ignored. The `linkedIn` group key is camelCase as supplied by the source.
const GROUP_TO_CATEGORY: Record<string, CategoryId> = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedIn: 'linkedin',
  x: 'x',
  pinterest: 'pinterest'
};

/**
 * Load social-media presets grouped by category. Assets without a recognized
 * social group or without a `FixedSize` transform preset are skipped.
 */
export async function loadSocialPresets(
  cesdk: CreativeEditorSDK
): Promise<PresetsByCategory> {
  const result: PresetsByCategory = {};

  let response;
  try {
    response = await cesdk.engine.asset.findAssets(PAGE_PRESETS_SOURCE, {
      page: 0,
      perPage: 999
    });
  } catch {
    return result; // source not registered
  }

  for (const asset of response.assets) {
    const transform = asset.payload?.transformPreset;
    if (transform == null || transform.type !== 'FixedSize') continue;

    const category = (asset.groups ?? [])
      .map((g) => GROUP_TO_CATEGORY[g])
      .find((c): c is CategoryId => c != null);
    if (category == null) continue;

    const bucket = (result[category] ??= []);
    bucket.push({
      id: asset.id,
      label: asset.label ?? asset.id,
      width: transform.width,
      height: transform.height
    });
  }

  return result;
}

/** Flatten grouped presets to a lookup by id (used at generate time). */
export function indexPresets(byCategory: PresetsByCategory): Map<string, Preset> {
  const map = new Map<string, Preset>();
  for (const presets of Object.values(byCategory)) {
    for (const preset of presets ?? []) map.set(preset.id, preset);
  }
  return map;
}
