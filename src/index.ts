/**
 * MultiCrop entry point. Wires the app shell to the renderer + crop editor.
 * (Filled in across tasks; this stub is replaced in Task 9.)
 */

const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  // eslint-disable-next-line no-console
  console.log('Selected file:', fileInput.files?.[0]?.name);
});
