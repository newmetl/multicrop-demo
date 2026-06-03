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

export interface CropEditorCallbacks {
  onSave: (sceneString: string) => void;
  onCancel: () => void;
}

export class CropEditor {
  private cesdk!: CreativeEditorSDK;
  private modal: HTMLElement;
  private title: HTMLElement;
  private currentImageBlock: number | null = null;

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
      userId: 'multicrop-demo-user'
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
    const imageBlock = engine.block
      .getChildren(page)
      .find((id) => engine.block.supportsCrop(id));
    if (imageBlock == null) throw new Error('open: no croppable block in scene');
    this.currentImageBlock = imageBlock;

    await this.fitPage(page);
    engine.block.select(imageBlock);
    engine.editor.setEditMode('Crop');
  }

  /** Exit crop mode and serialize the (edited) scene. Hides the modal. */
  async save(): Promise<string> {
    const { engine } = this.cesdk;
    engine.editor.setEditMode('Transform');
    const sceneString = await engine.scene.saveToString();
    this.hide();
    return sceneString;
  }

  hide(): void {
    this.modal.classList.add('hidden');
    this.currentImageBlock = null;
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
