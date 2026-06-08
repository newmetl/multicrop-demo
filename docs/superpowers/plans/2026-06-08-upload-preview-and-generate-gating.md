# Upload Preview + Generate Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the Generate button on an uploaded image (in addition to a selected size) and show a small inline thumbnail preview of the uploaded image.

**Architecture:** Shell-only change. Consolidate the Generate button's enable/disable logic into a single `refreshGenerate()` helper in `ui.ts` driven by two module flags (`hasImage`, `isGenerating`) plus the live checkbox query. Add an `<img id="upload-preview">` to the upload row whose `src` reuses the existing `state.sourceURI` blob URL (no new object URL). One orchestrator call, `setUploadedImage(name, previewUrl)`, performs all post-upload UI updates.

**Tech Stack:** Vanilla TypeScript + Vite, no framework. No test suite (project policy — CLAUDE.md). The verification gate is `npm run check:syntax` (`tsc --noEmit`) plus a manual browser check via the `multicrop-dev` preview server.

---

## Verification note (read first)

This project has **no automated tests** — that is a deliberate user decision
recorded in `CLAUDE.md` ("Tests are intentionally out of scope"). Do **not** add
a test framework or write unit tests. Each task is verified by:

1. `npm run check:syntax` → must report no errors.
2. For behavioral tasks, a browser check on the dev server (`npm run dev`, or the
   `multicrop-dev` preview server) following the steps given in the task.

## File structure

| File | Change |
| --- | --- |
| `index.html` | Add `<img id="upload-preview">` to the upload row + one CSS rule. |
| `src/app/ui.ts` | Consolidate Generate-enable logic into `refreshGenerate()`; add `hasImage`/`isGenerating` flags; replace `setUploadName` with `setUploadedImage`. |
| `src/index.ts` | Swap the import and the `handleUpload` call to `setUploadedImage`; capture the source URL in a local to keep it typed as `string`. |

Tasks are ordered so the build stays green (`check:syntax` passes) after each
commit. Task 1 is inert markup; Task 2 wires it up across `ui.ts` + `index.ts`
together (the `setUploadName` → `setUploadedImage` rename spans both files, so
they change in one commit).

---

### Task 1: Add the preview element + style (markup only)

**Files:**
- Modify: `index.html` (upload row ~lines 60–64; CSS in `<style>` ~line 18)

- [ ] **Step 1: Add the preview `<img>` to the upload row**

In `index.html`, the upload row currently reads:

```html
        <div class="row">
          <button id="upload-btn">Upload image</button>
          <span id="upload-name" class="muted"></span>
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
        </div>
```

Insert the preview image between the button and the filename span:

```html
        <div class="row">
          <button id="upload-btn">Upload image</button>
          <img id="upload-preview" class="hidden" alt="Upload preview" />
          <span id="upload-name" class="muted"></span>
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
        </div>
```

- [ ] **Step 2: Add the preview CSS rule**

In the `<style>` block, immediately after the `button:disabled { … }` rule
(currently `button:disabled { opacity: 0.5; cursor: not-allowed; }`), add:

```css
      #upload-preview { height: 64px; width: auto; max-width: 120px; object-fit: cover; border: 1px solid var(--border); border-radius: 6px; }
```

(`height: 64px` + `width: auto` preserves the image's aspect ratio; `max-width`
bounds very wide images, and `object-fit: cover` keeps that clamp from
distorting. The existing global `.hidden { display: none !important }` keeps it
hidden until first upload.)

- [ ] **Step 3: Verify the build is green**

Run: `npm run check:syntax`
Expected: completes with no errors (no TypeScript changed; this confirms nothing
was broken).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add hidden upload-preview element + style"
```

---

### Task 2: Gate Generate on an uploaded image + populate the preview

**Files:**
- Modify: `src/app/ui.ts` (`wireSelectionToGenerate`, `setGenerating`, `setUploadName`)
- Modify: `src/index.ts` (import block ~line 19–28; `handleUpload` ~lines 74–88)

- [ ] **Step 1: Consolidate the Generate-enable logic in `ui.ts`**

Replace these two functions in `src/app/ui.ts`:

```ts
/** Enable/disable Generate based on whether anything is checked. */
export function wireSelectionToGenerate(): void {
  const generateBtn = $('generate-btn') as HTMLButtonElement;
  $('sizes').addEventListener('change', () => {
    generateBtn.disabled = selectedPresetIds().length === 0;
  });
}

export function setGenerating(isGenerating: boolean): void {
  const status = $('generate-status');
  const btn = $('generate-btn') as HTMLButtonElement;
  btn.disabled = isGenerating || selectedPresetIds().length === 0;
  status.innerHTML = isGenerating
    ? '<span class="spinner"></span> Generating…'
    : '';
}
```

with this — a single source of truth (`refreshGenerate`) plus two module flags:

```ts
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

/** Re-evaluate Generate whenever the size selection changes. */
export function wireSelectionToGenerate(): void {
  $('sizes').addEventListener('change', refreshGenerate);
}

export function setGenerating(generating: boolean): void {
  isGenerating = generating;
  $('generate-status').innerHTML = generating
    ? '<span class="spinner"></span> Generating…'
    : '';
  refreshGenerate();
}
```

- [ ] **Step 2: Replace `setUploadName` with `setUploadedImage` in `ui.ts`**

Replace this function (currently at the bottom of `src/app/ui.ts`):

```ts
export function setUploadName(name: string): void {
  $('upload-name').textContent = name;
}
```

with:

```ts
/**
 * Reflect a freshly uploaded image in the shell: filename, inline preview, and
 * (once a size is also picked) an enabled Generate button. `previewUrl` is the
 * session `state.sourceURI` blob URL — reused here, NOT a new object URL, so it
 * adds no object-URL lifecycle concerns (see CLAUDE.md §7).
 */
export function setUploadedImage(name: string, previewUrl: string): void {
  $('upload-name').textContent = name;
  const preview = $('upload-preview') as HTMLImageElement;
  preview.src = previewUrl;
  preview.classList.remove('hidden');
  hasImage = true;
  refreshGenerate();
}
```

- [ ] **Step 3: Update the `ui` import in `src/index.ts`**

In the `from './app/ui'` import block, replace the line `  setUploadName,`
with `  setUploadedImage,`. The block becomes:

```ts
import {
  clearResults,
  renderGallery,
  renderSizeList,
  selectedPresetIds,
  setGenerating,
  setUploadedImage,
  updateTile,
  wireSelectionToGenerate
} from './app/ui';
```

- [ ] **Step 4: Call `setUploadedImage` from `handleUpload` in `src/index.ts`**

Replace the body of `handleUpload` (currently lines ~74–88):

```ts
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
```

with this — capture the URL in a local `sourceURI` so it stays typed as `string`
across the `await` (after the await, TS widens `state.sourceURI` back to
`string | null`, which `setUploadedImage`'s `string` parameter would reject):

```ts
async function handleUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file == null) return;
  // Reset any previous run: its crops reference the old source URL (about to be
  // revoked), so they would break. Start from a clean "pick sizes" state.
  for (const old of state.results) URL.revokeObjectURL(old.thumbnailUrl);
  state.results = [];
  clearResults();
  if (state.sourceURI) URL.revokeObjectURL(state.sourceURI);
  const sourceURI = URL.createObjectURL(file);
  state.sourceURI = sourceURI;
  const { width, height } = await getImageSize(sourceURI);
  state.sourceWidth = width;
  state.sourceHeight = height;
  setUploadedImage(file.name, sourceURI);
}
```

- [ ] **Step 5: Verify the build is green**

Run: `npm run check:syntax`
Expected: completes with no errors. (Confirms the `setUploadName` →
`setUploadedImage` rename is consistent across both files and the typing holds.)

- [ ] **Step 6: Browser check**

Start the dev server (`npm run dev`, open http://localhost:5173, or use the
`multicrop-dev` preview server) and confirm, after the editor/presets finish
loading:

1. **Before upload:** Generate is disabled. Tick a size or two → Generate stays
   **disabled** (no image yet).
2. **Upload an image:** a small thumbnail preview appears between the Upload
   button and the filename. With a size still ticked, Generate is now
   **enabled**. Untick all sizes → Generate disables again.
3. **Generate:** click it → during generation the button is disabled and the
   spinner shows; afterward it re-enables.
4. **Re-upload a different image:** the preview swaps to the new image, the
   previous results clear, and there are no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/ui.ts src/index.ts
git commit -m "feat: gate Generate on an uploaded image + show upload preview"
```

---

## Self-review

**Spec coverage:**
- Spec Change 1 (gate Generate on image + size; remove the no-image no-op) →
  Task 2 Steps 1, 3, 4 (`refreshGenerate` with `!hasImage`, `hasImage` set in
  `setUploadedImage`). ✓
- Spec Change 2 (inline ~64px preview between button and filename, reusing
  `sourceURI`, no new object URL) → Task 1 (element + CSS) + Task 2 Steps 2, 4
  (`setUploadedImage` sets `preview.src = sourceURI`). ✓
- Spec "post-upload UI consolidation" (`setUploadedImage` does filename +
  preview + enable) → Task 2 Step 2. ✓
- Spec verification items → Task 2 Step 6 browser checks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `setUploadedImage(name: string, previewUrl: string)` is
defined in Task 2 Step 2, imported in Step 3, and called with
`(file.name, sourceURI)` — both `string` — in Step 4. `refreshGenerate`,
`hasImage`, `isGenerating` are defined and used within `ui.ts` (Step 1) and
referenced by `setUploadedImage` (Step 2). `setUploadName` is fully removed (no
dangling references — confirmed it had no other callers). ✓
