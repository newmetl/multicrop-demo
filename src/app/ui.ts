/**
 * DOM rendering + event wiring for the app shell: the size preset cards, the
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

// Checkmark glyph reused in selected size cards (stroke inherits white).
const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

// The card preview shows a proportional aspect-ratio rectangle: the preset's
// longest side maps to PREVIEW_MAX px, the shorter side scales down, clamped to
// PREVIEW_MIN so extreme ratios stay visible.
const PREVIEW_MAX = 36;
const PREVIEW_MIN = 8;

function previewRect(width: number, height: number): { w: number; h: number } {
  const longest = Math.max(width, height, 1);
  return {
    w: Math.max(PREVIEW_MIN, Math.round((width / longest) * PREVIEW_MAX)),
    h: Math.max(PREVIEW_MIN, Math.round((height / longest) * PREVIEW_MAX))
  };
}

/**
 * Render the grouped preset cards. Each card is a <label> wrapping a
 * visually-hidden checkbox (so `selectedPresetIds()` still works and the whole
 * card toggles selection); the selected look is driven purely by CSS `:has()`.
 */
export function renderSizeList(byCategory: PresetsByCategory): void {
  const container = $('sizes');
  container.innerHTML = '';
  for (const category of CATEGORY_ORDER) {
    const presets = byCategory[category];
    if (presets == null || presets.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'group';

    const heading = document.createElement('div');
    heading.className = 'group-title';
    // Brand glyph (inherits the heading's muted color via currentColor) + label.
    heading.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${CATEGORY_ICON[category]}</svg>`;
    heading.append(CATEGORY_LABEL[category]);
    group.appendChild(heading);

    const cards = document.createElement('div');
    cards.className = 'size-cards';
    for (const preset of presets) {
      const rect = previewRect(preset.width, preset.height);
      const card = document.createElement('label');
      card.className = 'size-card';
      card.innerHTML =
        `<input class="sr-only" type="checkbox" data-preset-checkbox value="${preset.id}" />` +
        `<span class="size-check">${CHECK_SVG}</span>` +
        `<span class="size-prev"><span class="size-rect" style="width:${rect.w}px;height:${rect.h}px"></span></span>` +
        `<span class="size-name">${preset.label}</span>` +
        `<span class="size-dim">${preset.width} × ${preset.height}</span>`;
      cards.appendChild(card);
    }
    group.appendChild(cards);
    container.appendChild(group);
  }
  updateSelectedCount();
  // The panel stays hidden until an image is uploaded — the upload step is the
  // app's entry point, and `setUploadedImage()` reveals this panel. Presets are
  // built here (during startup) so the reveal is instant, no loading needed.
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

/** Reflect the current selection count in the panel-head pill + Clear button. */
function updateSelectedCount(): void {
  const n = selectedPresetIds().length;
  const pill = $('sizes-count');
  pill.textContent = `${n} selected`;
  pill.classList.toggle('zero', n === 0);
  ($('clear-sizes-btn') as HTMLButtonElement).disabled = n === 0;
}

/** Uncheck every selected preset, then refresh the dependent UI. */
function clearSelection(): void {
  document
    .querySelectorAll<HTMLInputElement>('input[data-preset-checkbox]:checked')
    .forEach((cb) => {
      cb.checked = false;
    });
  refreshGenerate();
  updateSelectedCount();
}

/** Wire the size controls: re-evaluate Generate + count on change, and Clear. */
export function wireSelectionToGenerate(): void {
  $('sizes').addEventListener('change', () => {
    refreshGenerate();
    updateSelectedCount();
  });
  $('clear-sizes-btn').addEventListener('click', clearSelection);
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
const THUMB_MAX_SIDE = 104;
const THUMB_MIN_SIDE = 22;

/**
 * Thumbnail pixel size for a crop, scaled by the shared batch factor and always
 * preserving aspect ratio. The visibility floor (THUMB_MIN_SIDE) is applied to
 * the LONGER side only: clamping each axis independently distorts extreme ratios
 * (a 1128×191 banner would be forced from ~56×9 to 56×22, skewing it). Tiny
 * crops are scaled up uniformly so their longest side stays visible.
 */
function thumbSize(
  width: number,
  height: number,
  scale: number
): { w: number; h: number } {
  let w = width * scale;
  let h = height * scale;
  const longer = Math.max(w, h);
  if (longer < THUMB_MIN_SIDE) {
    const up = THUMB_MIN_SIDE / longer;
    w *= up;
    h *= up;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

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
    // The whole tile edits its crop. It's a <div> (not a <button>) because it
    // contains the delete <button>, and buttons can't nest — so give it explicit
    // button semantics and keyboard support instead.
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;
    tile.setAttribute('role', 'button');
    tile.tabIndex = 0;
    tile.setAttribute('aria-label', `Edit ${result.presetLabel} crop`);
    tile.addEventListener('click', () => onEdit(result.id));
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEdit(result.id);
      }
    });

    // Fixed-size stage; the thumbnail is scaled to its relative size + centered.
    const stage = document.createElement('div');
    stage.className = 'stage';

    const { w: thumbW, h: thumbH } = thumbSize(result.width, result.height, scale);
    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;
    img.style.width = `${thumbW}px`;
    img.style.height = `${thumbH}px`;
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
    caption.innerHTML = `<b>${result.presetLabel}</b> · ${result.width}×${result.height}`;

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
  const img = document.querySelector<HTMLImageElement>(
    `.tile[data-result-id="${result.id}"] img`
  );
  if (img != null) img.src = result.thumbnailUrl;
}

/** Human-readable byte size, e.g. 2.4 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Reflect a freshly uploaded image in the shell: filename, dimensions + size,
 * inline preview, relabeled button, and (once a size is also picked) an enabled
 * Generate button. `previewUrl` is the session `state.sourceURI` blob URL —
 * reused here, NOT a new object URL, so it adds no object-URL lifecycle concerns
 * (see CLAUDE.md §7).
 */
export function setUploadedImage(
  name: string,
  previewUrl: string,
  width: number,
  height: number,
  sizeBytes: number
): void {
  $('upload-name').textContent = name;
  $('upload-sub').textContent = `${width} × ${height} · ${formatBytes(sizeBytes)}`;
  const preview = $('upload-preview') as HTMLImageElement;
  preview.src = previewUrl;
  preview.classList.remove('hidden');
  ($('upload-btn') as HTMLButtonElement).textContent = 'Replace image';
  // The sample shortcut is a get-started affordance; once an image is loaded the
  // "Replace image" button covers swapping it out.
  $('sample-btn').classList.add('hidden');
  // Reveal the size-presets step now that there's an image to crop — this guides
  // the user from upload → choose sizes. Idempotent on re-upload. Presets are
  // already rendered (built at startup), so the reveal is instant.
  $('sizes-panel').classList.remove('hidden');
  hasImage = true;
  refreshGenerate();
}

/** Empty the gallery and hide the results panel (e.g. on a new upload). */
export function clearResults(): void {
  $('gallery').innerHTML = '';
  $('results-panel').classList.add('hidden');
}
