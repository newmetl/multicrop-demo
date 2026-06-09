/**
 * Crop-only editor configuration: a stripped-down photo editor exposing nothing
 * but the canvas and the crop rectangle. Every dock/panel/bar/menu is emptied,
 * all features except crop are disabled. The crop frame is resizable (handles
 * shown) but ratio-locked per-block via `setCropAspectRatioLocked` (set in
 * scene.ts), so resizing preserves the preset aspect; no aspect-ratio picker UI
 * is exposed.
 *
 * Settings mirror the relevant crop/page settings from the starter kit's
 * photo-editor/settings.ts (single-image crop behavior).
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export function configureCropEditor(cesdk: CreativeEditorSDK): void {
  console.log('configureCropEditor()');
  const { engine } = cesdk;

  cesdk.feature.enable([
    'ly.img.crop.scale'
  ]);
  
  // --- Page/crop visuals ---
  // The page IS the crop. allowCropInteraction lets the user drag the image
  // under the centered page frame while the engine keeps it covered — the
  // photo-editor starter kit's crop behavior. Without it the image can't be
  // panned in crop mode. (This setting was the key missing enabler.)
  engine.editor.setSetting('page/allowCropInteraction', true);
  engine.editor.setSetting('page/allowResizeInteraction', true);
  engine.editor.setSetting('page/restrictResizeInteractionToFixedAspectRatio', true);

  engine.editor.setSetting('page/title/show', false);

  // Interaction
  engine.editor.setSetting('doubleClickToCropEnabled', false);

  // Supporting page UX (not named "crop" but part of the experience)
  engine.editor.setSetting('page/dimOutOfPageAreas', true);
  engine.editor.setSetting('page/selectWhenNoBlocksSelected', true);
}
