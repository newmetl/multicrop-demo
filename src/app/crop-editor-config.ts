/**
 * Crop-only editor configuration: a stripped-down photo editor exposing nothing
 * but the canvas and the crop rectangle. Every dock/panel/bar/menu is emptied,
 * all features except crop are disabled, and the crop frame is locked to the
 * page (no aspect-ratio selection, no crop resize handles) so the user can only
 * pan/scale the image within the fixed preset frame.
 *
 * Settings mirror the relevant crop/page settings from the starter kit's
 * photo-editor/settings.ts (single-image crop behavior).
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export function configureCropEditor(cesdk: CreativeEditorSDK): void {
  const { engine } = cesdk;

  // --- Features: crop only ---
  cesdk.feature.enable(['ly.img.crop']);
  // Disable everything that would add chrome or editing affordances.
  cesdk.feature.disable([
    'ly.img.text',
    'ly.img.filter',
    'ly.img.adjustment',
    'ly.img.effect',
    'ly.img.blur',
    'ly.img.shadow',
    'ly.img.delete',
    'ly.img.duplicate',
    'ly.img.group',
    'ly.img.replace',
    'ly.img.dock',
    'ly.img.library.panel',
    'ly.img.navigation.bar',
    'ly.img.inspector.bar',
    'ly.img.canvas.menu'
  ]);

  // --- UI: empty every region so only the canvas + crop gizmo remain ---
  cesdk.ui.setComponentOrder({ in: 'ly.img.dock' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.navigation.bar' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.bar', at: 'top' }, []);
  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.bar', at: 'bottom' }, []);
  cesdk.ui.setComponentOrder(
    { in: 'ly.img.canvas.menu', when: { editMode: 'Crop' } },
    []
  );

  // --- Crop frame locked to the preset ---
  // Hide the aspect-ratio selector and the crop resize handles, so the frame
  // can't be resized — only the image is pannable/scalable inside it.
  engine.editor.setSettingString('ui/crop/aspectRatios', '');
  engine.editor.setSettingBool('ui/crop/allowAspectRatioSelection', false);
  engine.editor.setSettingBool('controlGizmo/showCropHandles', false);
  // Keep scale handles so users can zoom the image within the frame.
  engine.editor.setSettingBool('controlGizmo/showCropScaleHandles', true);

  // --- Page/crop visuals ---
  engine.editor.setSetting('page/dimOutOfPageAreas', true);
  engine.editor.setSetting('page/highlightWhenCropping', true);
  engine.editor.setSetting('page/title/show', false);
  engine.editor.setSetting('doubleClickToCropEnabled', false);
}
