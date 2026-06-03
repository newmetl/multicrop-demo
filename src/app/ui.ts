/**
 * DOM rendering + event wiring for the app shell: the size checkbox list, the
 * results gallery (hover → Edit), the generate spinner, and panel visibility.
 * Holds no engine logic — it calls back into the orchestrator (index.ts).
 */

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type PresetsByCategory
} from './presets';
import type { CropResult } from './state';

const $ = (id: string) => document.getElementById(id)!;

/** Render the grouped checkbox list. Returns nothing; read selection on demand. */
export function renderSizeList(byCategory: PresetsByCategory): void {
  const container = $('sizes');
  container.innerHTML = '';
  for (const category of CATEGORY_ORDER) {
    const presets = byCategory[category];
    if (presets == null || presets.length === 0) continue;

    const heading = document.createElement('div');
    heading.className = 'group-title';
    heading.textContent = CATEGORY_LABEL[category];
    container.appendChild(heading);

    for (const preset of presets) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = preset.id;
      cb.dataset.presetCheckbox = 'true';
      const span = document.createElement('span');
      span.textContent = `${preset.label} (${preset.width}×${preset.height})`;
      label.append(cb, span);
      container.appendChild(label);
    }
  }
  $('sizes-panel').classList.remove('hidden');
}

/** Selected preset ids, in DOM order. */
export function selectedPresetIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[data-preset-checkbox]:checked'
    )
  ).map((cb) => cb.value);
}

/** Enable/disable Generate based on whether anything is checked. */
export function wireSelectionToGenerate(): void {
  const generateBtn = $('generate-btn') as HTMLButtonElement;
  $('sizes').addEventListener('change', () => {
    generateBtn.disabled = selectedPresetIds().length === 0;
  });
}

export function setGenerating(isGenerating: boolean): void {
  const status = $('generate-status');
  const btn = $('generate-btn') as HTMLButtonElement;
  btn.disabled = isGenerating || selectedPresetIds().length === 0;
  status.innerHTML = isGenerating
    ? '<span class="spinner"></span> Generating…'
    : '';
}

/** Render the gallery from results, wiring each Edit button via `onEdit`. */
export function renderGallery(
  results: CropResult[],
  onEdit: (id: string) => void
): void {
  const gallery = $('gallery');
  gallery.innerHTML = '';
  for (const result of results) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;

    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = `${result.presetLabel} · ${result.width}×${result.height}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => onEdit(result.id));

    tile.append(img, caption, editBtn);
    gallery.appendChild(tile);
  }
  $('results-panel').classList.remove('hidden');
}

/** Update a single tile's image after a re-render (no full re-render). */
export function updateTile(result: CropResult): void {
  const tile = document.querySelector<HTMLElement>(
    `.tile[data-result-id="${result.id}"] img`
  );
  if (tile != null) (tile as HTMLImageElement).src = result.thumbnailUrl;
}

export function setUploadName(name: string): void {
  $('upload-name').textContent = name;
}
