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

async function main(): Promise<void> {
  // Create the hidden crop editor once; it also hosts the preset catalog.
  editor = await CropEditor.create({
    onSave: handleEditorSave,
    onCancel: () => {}
  });

  const byCategory = await loadSocialPresets(editor.sdk);
  presetIndex = indexPresets(byCategory);
  renderSizeList(byCategory);
  wireSelectionToGenerate();

  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleUpload(fileInput));

  document
    .getElementById('generate-btn')!
    .addEventListener('click', handleGenerate);
  document
    .getElementById('download-all-btn')!
    .addEventListener('click', () => downloadAll(state.results));
}

async function handleUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file == null) return;
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
  await editor.open(result.sceneString, result.presetLabel);
}

async function handleEditorSave(sceneString: string): Promise<void> {
  if (editingId == null) return;
  const result = findResult(editingId);
  editingId = null;
  if (result == null) return;
  result.sceneString = sceneString;
  const blob = await renderScene(sceneString);
  setThumbnail(result, URL.createObjectURL(blob));
  updateTile(result);
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
