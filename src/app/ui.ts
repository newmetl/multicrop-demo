/**
 * DOM rendering + event wiring for the app shell: the size checkbox list, the
 * results gallery (hover → Edit), the generate spinner, and panel visibility.
 * Holds no engine logic — it calls back into the orchestrator (index.ts).
 */

import {
  CATEGORY_ICON,
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
    // Brand glyph (inherits the heading's muted color via currentColor) + label.
    heading.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${CATEGORY_ICON[category]}</svg>`;
    heading.append(CATEGORY_LABEL[category]);
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

// Generate is enabled only when an image is uploaded, at least one size is
// ticked, and we're not mid-generation. These flags + the live checkbox query
// are the single source of truth, read by refreshGenerate().
let hasImage = false;
let isGenerating = false;

/** Recompute the Generate button's disabled state from the current inputs. */
function refreshGenerate(): void {
  const btn = $('generate-btn') as HTMLButtonElement;
  btn.disabled = isGenerating || !hasImage || selectedPresetIds().length === 0;
}

/** Re-evaluate Generate whenever the size selection changes. */
export function wireSelectionToGenerate(): void {
  $('sizes').addEventListener('change', refreshGenerate);
}

export function setGenerating(generating: boolean): void {
  isGenerating = generating;
  $('generate-status').innerHTML = generating
    ? '<span class="spinner"></span> Generating…'
    : '';
  refreshGenerate();
}

/** Show a short note in the generate-status area (e.g. nothing new to do). */
export function setGenerateNote(text: string): void {
  $('generate-status').textContent = text;
}

// The tiles share one width (uniform grid); only the thumbnail inside each tile
// is sized relative to its crop. The largest crop's longest side maps to
// THUMB_MAX_SIDE (which fits inside the fixed-height stage), and every other
// thumbnail is scaled by the same factor — so a 1920px crop shows a bigger
// thumbnail than a 320px one, centered in the same-size box.
const THUMB_MAX_SIDE = 180;
const THUMB_MIN_SIDE = 24;

/**
 * Render the gallery from results. The whole tile is the click-to-edit target
 * (`onEdit`); a centered "Edit" pill appears on hover as the affordance. A
 * top-right ✕ deletes that version (`onDelete`) — its handler stops propagation
 * so deleting never also opens the editor.
 */
export function renderGallery(
  results: CropResult[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void
): void {
  const gallery = $('gallery');
  gallery.innerHTML = '';

  // Shared scale across the batch so thumbnail sizes are comparable.
  const maxSide = Math.max(1, ...results.flatMap((r) => [r.width, r.height]));
  const scale = THUMB_MAX_SIDE / maxSide;

  for (const result of results) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;
    tile.addEventListener('click', () => onEdit(result.id));

    // Fixed-size stage; the thumbnail is scaled to its relative size + centered.
    const stage = document.createElement('div');
    stage.className = 'stage';

    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;
    img.style.width = `${Math.max(THUMB_MIN_SIDE, Math.round(result.width * scale))}px`;
    img.style.height = `${Math.max(THUMB_MIN_SIDE, Math.round(result.height * scale))}px`;
    stage.appendChild(img);

    // Centered hover affordance (a clear "this box is clickable" cue). No own
    // click handler — clicks bubble to the tile's edit handler.
    const editHint = document.createElement('div');
    editHint.className = 'edit-hint';
    const editPill = document.createElement('span');
    editPill.textContent = 'Edit';
    editHint.appendChild(editPill);
    stage.appendChild(editHint);

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = `${result.presetLabel} · ${result.width}×${result.height}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete ${result.presetLabel}`);
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(result.id);
    });

    tile.append(stage, caption, deleteBtn);
    gallery.appendChild(tile);
  }
  $('results-panel').classList.remove('hidden');
}

/** Remove a single tile by id; hide the results panel if none remain. */
export function removeTile(id: string): void {
  document.querySelector(`.tile[data-result-id="${id}"]`)?.remove();
  if ($('gallery').children.length === 0) {
    $('results-panel').classList.add('hidden');
  }
}

/** Update a single tile's image after a re-render (no full re-render). */
export function updateTile(result: CropResult): void {
  const tile = document.querySelector<HTMLElement>(
    `.tile[data-result-id="${result.id}"] img`
  );
  if (tile != null) (tile as HTMLImageElement).src = result.thumbnailUrl;
}

/**
 * Reflect a freshly uploaded image in the shell: filename, inline preview, and
 * (once a size is also picked) an enabled Generate button. `previewUrl` is the
 * session `state.sourceURI` blob URL — reused here, NOT a new object URL, so it
 * adds no object-URL lifecycle concerns (see CLAUDE.md §7).
 */
export function setUploadedImage(name: string, previewUrl: string): void {
  $('upload-name').textContent = name;
  const preview = $('upload-preview') as HTMLImageElement;
  preview.src = previewUrl;
  preview.classList.remove('hidden');
  hasImage = true;
  refreshGenerate();
}

/** Empty the gallery and hide the results panel (e.g. on a new upload). */
export function clearResults(): void {
  $('gallery').innerHTML = '';
  $('results-panel').classList.add('hidden');
}
