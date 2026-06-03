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
import { findResult, setThumbnail, state } from './app/state';
import {
  clearResults,
  renderGallery,
  renderSizeList,
  selectedPresetIds,
  setGenerating,
  setUploadName,
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
}

async function handleUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file == null) return;
  // Reset any previous run: its crops reference the old source URL (about to be
  // revoked), so they would break. Start from a clean "pick sizes" state.
  for (const old of state.results) URL.revokeObjectURL(old.thumbnailUrl);
  state.results = [];
  clearResults();
  if (state.sourceURI) URL.revokeObjectURL(state.sourceURI);
  state.sourceURI = URL.createObjectURL(file);
  const { width, height } = await getImageSize(state.sourceURI);
  state.sourceWidth = width;
  state.sourceHeight = height;
  setUploadName(file.name);
}

async function handleGenerate(): Promise<void> {
  if (state.sourceURI == null) return;
  const ids = selectedPresetIds();
  const presets = ids
    .map((id) => presetIndex.get(id))
    .filter((p): p is Preset => p != null);
  if (presets.length === 0) return;

  setGenerating(true);
  try {
    const focal = await focalPointFor(state.sourceURI);
    const results = await generateCrops(
      state.sourceURI,
      state.sourceWidth,
      state.sourceHeight,
      presets,
      focal
    );
    // Revoke the previous run's thumbnail object URLs before replacing them,
    // so re-generating doesn't leak blobs.
    for (const old of state.results) URL.revokeObjectURL(old.thumbnailUrl);
    state.results = results;
    renderGallery(results, handleEdit);
  } finally {
    setGenerating(false);
  }
}

let editingId: string | null = null;

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
    const blob = await renderScene(sceneString);
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
});
