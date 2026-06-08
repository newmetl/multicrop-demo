/**
 * MultiCrop orchestrator. Owns app state and wires the shell, the headless
 * renderer, and the hidden crop editor together.
 */

import { CropEditor } from './app/editor';
import {
  generateCrops,
  focalPointFor,
  renderScene
} from './app/renderer';
import { downloadAll } from './app/download';
import {
  indexPresets,
  loadSocialPresets,
  type Preset
} from './app/presets';
import {
  clearAllResults,
  findResult,
  removeResult,
  setThumbnail,
  state
} from './app/state';
import {
  clearResults,
  removeTile,
  renderGallery,
  renderSizeList,
  selectedPresetIds,
  setGenerateNote,
  setGenerating,
  setUploadedImage,
  updateTile,
  wireSelectionToGenerate
} from './app/ui';

let editor: CropEditor;
let presetIndex: Map<string, Preset> = new Map();

/** Log an error and surface it to the user, so failures aren't silent. */
function notifyError(context: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`${context}:`, error);
  window.alert(`${context}. See the console for details.`);
}

async function main(): Promise<void> {
  // Create the hidden crop editor once; it also hosts the preset catalog.
  editor = await CropEditor.create({
    onSave: handleEditorSave,
    onCancel: () => {
      editingId = null;
    }
  });

  const byCategory = await loadSocialPresets(editor.sdk);
  presetIndex = indexPresets(byCategory);
  renderSizeList(byCategory);
  wireSelectionToGenerate();
  // Editor + presets are ready: reveal the app and drop the full-screen overlay.
  document.getElementById('app')!.classList.remove('hidden');
  document.getElementById('loading-overlay')!.classList.add('hidden');

  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleUpload(fileInput).catch((e) => notifyError('Upload failed', e));
  });

  document
    .getElementById('generate-btn')!
    .addEventListener('click', () => {
      handleGenerate().catch((e) => notifyError('Generating crops failed', e));
    });
  document.getElementById('download-all-btn')!.addEventListener('click', () => {
    downloadAll(state.results).catch((e) => notifyError('Download failed', e));
  });
  document
    .getElementById('delete-all-btn')!
    .addEventListener('click', handleDeleteAll);
}

async function handleUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file == null) return;
  // Replacing the image discards every version (their crops reference the old
  // source URL, about to be revoked). Confirm before wiping the user's work.
  if (state.results.length > 0) {
    const ok = window.confirm(
      `Uploading a new image will remove all ${state.results.length} current versions. Continue?`
    );
    if (!ok) {
      input.value = '';
      return;
    }
  }
  clearAllResults();
  clearResults();
  if (state.sourceURI) URL.revokeObjectURL(state.sourceURI);
  const sourceURI = URL.createObjectURL(file);
  state.sourceURI = sourceURI;
  const { width, height } = await getImageSize(sourceURI);
  state.sourceWidth = width;
  state.sourceHeight = height;
  setUploadedImage(file.name, sourceURI);
}

async function handleGenerate(): Promise<void> {
  if (state.sourceURI == null) return;
  // Additive: skip presets that already have a version, so existing versions
  // (and any edits the user made) are preserved. To recreate one, delete it
  // first, then Generate.
  const existing = new Set(state.results.map((r) => r.id));
  const presets = selectedPresetIds()
    .map((id) => presetIndex.get(id))
    .filter((p): p is Preset => p != null && !existing.has(p.id));
  if (presets.length === 0) {
    setGenerateNote('All selected sizes already generated.');
    return;
  }

  setGenerating(true);
  try {
    const focal = await focalPointFor(state.sourceURI);
    const created = await generateCrops(
      state.sourceURI,
      state.sourceWidth,
      state.sourceHeight,
      presets,
      focal
    );
    state.results = state.results.concat(created);
    renderGallery(state.results, handleEdit, handleDelete);
  } finally {
    setGenerating(false);
  }
}

let editingId: string | null = null;

function handleDelete(id: string): void {
  if (removeResult(id)) removeTile(id);
}

function handleDeleteAll(): void {
  const count = state.results.length;
  if (count === 0) return;
  if (!window.confirm(`Delete all ${count} versions? This can't be undone.`)) {
    return;
  }
  clearAllResults();
  clearResults();
}

async function handleEdit(id: string): Promise<void> {
  const result = findResult(id);
  if (result == null) return;
  editingId = id;
  try {
    await editor.open(result.sceneString, result.presetLabel);
  } catch (error) {
    editingId = null;
    editor.hide();
    notifyError('Opening the editor failed', error);
  }
}

async function handleEditorSave(sceneString: string): Promise<void> {
  if (editingId == null) return;
  const result = findResult(editingId);
  editingId = null;
  if (result == null) return;
  try {
    result.sceneString = sceneString;
    const blob = await renderScene(sceneString, result.width, result.height);
    setThumbnail(result, URL.createObjectURL(blob));
    updateTile(result);
  } catch (error) {
    notifyError('Saving the crop failed', error);
  }
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image: ${uri}`));
    img.src = uri;
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('MultiCrop failed to start:', error);
  // Don't leave the startup spinner spinning forever — show the failure there.
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  const spinner = overlay?.querySelector('.spinner');
  spinner?.remove();
  if (text != null) {
    text.textContent =
      'Failed to load the editor. See the console for details.';
  }
});
