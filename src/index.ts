import { getRenderEngine } from './app/renderer';
import { buildPresetScene } from './app/scene';
import { computeFocalPoint } from './app/saliency';

const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const gallery = document.getElementById('gallery') as HTMLDivElement;
document.getElementById('results-panel')!.classList.remove('hidden');

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (file == null) return;
  const uri = URL.createObjectURL(file);
  const { width, height } = await getImageSize(uri);
  const engine = await getRenderEngine();
  const focal = await computeFocalPoint(uri, engine as any);

  // 9:16 portrait (Instagram Story) and 16:9 landscape to exercise both axes.
  for (const preset of [
    { label: '1080x1920', width: 1080, height: 1920 },
    { label: '1920x1080', width: 1920, height: 1080 }
  ]) {
    const { sceneString } = await buildPresetScene(
      engine,
      uri,
      width,
      height,
      preset,
      focal
    );
    await engine.scene.loadFromString(sceneString);
    const page = engine.block.findByType('page')[0];
    const blob = await engine.block.export(page, { mimeType: 'image/png' });
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.style.width = '220px';
    gallery.appendChild(img);
  }
});

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image load failed'));
    img.src = uri;
  });
}
