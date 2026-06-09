/**
 * The crop editor: one CreativeEditorSDK instance created once at startup and
 * kept hidden inside the editor modal. On open it loads the target preset's
 * scene string, selects the croppable image block, and enters Crop mode; on
 * save it serializes the scene back. The instance is reused across edits, so
 * opening is instant.
 *
 * It also hosts PagePresetsAssetSource so the app can read the social-media
 * preset catalog from a single CE.SDK instance.
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';
import { PagePresetsAssetSource } from '@cesdk/cesdk-js/plugins';

import { configureCropEditor } from './crop-editor-config';
import { CESDK_LICENSE, CESDK_USER_ID } from './license';

export interface CropEditorCallbacks {
  onSave: (sceneString: string) => void;
  onCancel: () => void;
}

export class CropEditor {
  private cesdk!: CreativeEditorSDK;
  private modal: HTMLElement;
  private title: HTMLElement;
  /** Unsubscribe for the crop-mode guard (active only while editing). */
  private cropGuard: (() => void) | null = null;

  private constructor(modal: HTMLElement, title: HTMLElement) {
    this.modal = modal;
    this.title = title;
  }

  /** Create the editor instance (once) and wire modal buttons. */
  static async create(callbacks: CropEditorCallbacks): Promise<CropEditor> {
    const modal = document.getElementById('editor-modal') as HTMLElement;
    const title = document.getElementById('editor-title') as HTMLElement;
    const instance = new CropEditor(modal, title);

    const cesdk = await CreativeEditorSDK.create('#cesdk_container', {
      userId: CESDK_USER_ID,
      // Light theme so the editor canvas matches the app's light shell.
      theme: 'light',
      ...(CESDK_LICENSE ? { license: CESDK_LICENSE } : {})
    });
    instance.cesdk = cesdk;

    configureCropEditor(cesdk);
    await cesdk.addPlugin(new PagePresetsAssetSource());

    const saveBtn = document.getElementById('editor-save') as HTMLButtonElement;
    const cancelBtn = document.getElementById('editor-cancel') as HTMLButtonElement;
    saveBtn.addEventListener('click', async () => {
      const sceneString = await instance.save();
      callbacks.onSave(sceneString);
    });
    cancelBtn.addEventListener('click', () => {
      instance.hide();
      callbacks.onCancel();
    });

    return instance;
  }

  /** Expose the SDK so the app can read presets from this instance. */
  get sdk(): CreativeEditorSDK {
    return this.cesdk;
  }

  /**
   * Show the modal and load the given scene for cropping. Selects the image
   * block, enters Crop mode, and fits the page to the viewport.
   */
  async open(sceneString: string, label: string): Promise<void> {
    const { engine } = this.cesdk;
    this.title.textContent = `Edit crop — ${label}`;
    this.modal.classList.remove('hidden');

    await engine.scene.loadFromString(sceneString);
    const page = engine.block.findByType('page')[0];
    if (page == null) throw new Error('open: scene has no page');

    await this.fitPage(page);
    this.enterCropMode(page);
  }

  /**
   * Select the crop block (the page) and enter Crop mode — and hold it there.
   *
   * On the FIRST open the editor's WebGL canvas mounts a few frames after this
   * runs (the canvas only mounts once the modal is genuinely visible), and that
   * mount resets the edit mode back to the default 'Transform'. The stripped
   * crop-only UI has no dock/crop button to re-enter Crop, so we re-assert Crop
   * whenever the editor leaves it while the modal is open. The guard is torn down
   * on save/cancel so it never fights the Transform that `save()` sets to
   * serialize the result.
   */
  private enterCropMode(cropBlock: number): void {
    const { engine } = this.cesdk;
    this.teardownCropGuard();
    const apply = () => {
      engine.block.select(cropBlock);
      engine.editor.setEditMode('Crop');
    };
    apply();
    // Keep Crop mode sticky: clicking the canvas (or the first-open canvas mount)
    // drops the editor back to 'Transform' and commits the crop. Re-assert Crop
    // whenever the editor leaves it while the modal is open, so the user can only
    // exit via Save or Cancel. Torn down in save()/hide() before they set
    // 'Transform', so it never fights the intended exit.
    this.cropGuard = engine.editor.onStateChanged(() => {
      if (this.modal.classList.contains('hidden')) return;
      if (engine.editor.getEditMode() !== 'Crop') apply();
    });
  }

  /** Remove the crop-mode guard (if any) so it can't re-assert Crop. */
  private teardownCropGuard(): void {
    if (this.cropGuard != null) {
      this.cropGuard();
      this.cropGuard = null;
    }
  }

  /** Exit crop mode and serialize the (edited) scene. Hides the modal. */
  async save(): Promise<string> {
    const { engine } = this.cesdk;
    // Tear down the guard BEFORE switching to Transform — otherwise it would snap
    // us straight back into Crop and corrupt the serialized result. (hide(),
    // called below, tears down again; that second call is a safe no-op.)
    this.teardownCropGuard();
    engine.editor.setEditMode('Transform');
    const sceneString = await engine.scene.saveToString();
    this.hide();
    return sceneString;
  }

  hide(): void {
    this.teardownCropGuard();
    // The editor instance is reused across edits, so leave it in a clean state.
    // If a block is still selected in Crop mode when the NEXT scene loads,
    // loadFromString destroys that block while a crop/timeline UI subscription is
    // still reading it — CE.SDK then throws "Block N is unknown" (seen as the
    // "Unknown Error" modal). Resetting here, while THIS scene's blocks still
    // exist, flushes those subscriptions safely. save() already exits Crop before
    // serializing; cancel did not, which is why the error only appeared after
    // Cancel-then-edit-another.
    const { engine } = this.cesdk;
    engine.editor.setEditMode('Transform');
    for (const id of engine.block.findAllSelected()) {
      engine.block.setSelected(id, false);
    }
    this.modal.classList.add('hidden');
  }

  /**
   * Fit the page to the viewport, waiting for the canvas to settle (the modal
   * was just shown, so the container size may stabilize over a few frames).
   * Mirrors multicrop-demo-1's fitPageToViewport.
   */
  private async fitPage(page: number): Promise<void> {
    const { engine } = this.cesdk;
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    engine.scene.enableZoomAutoFit(page, 'Both', 40, 40, 40, 40);
    let previous = -1;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await nextFrame();
      const zoom = engine.scene.getZoomLevel();
      if (zoom > 0.01 && Math.abs(zoom - previous) < 0.0005) break;
      previous = zoom;
    }
    engine.scene.disableZoomAutoFit(page);
  }
}
