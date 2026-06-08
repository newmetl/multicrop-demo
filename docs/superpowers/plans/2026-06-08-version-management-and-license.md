# Gallery Version Management + License Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users manage generated crops as a controlled set of versions (per-tile delete, whole-box click-to-edit, additive non-overwriting re-generate, delete-all + upload confirmations) and wire the CE.SDK license from `VITE_CESDK_LICENSE` to remove the watermark when present.

**Architecture:** Shell-only. `state.ts` owns the results array + thumbnail-URL lifecycle (revoke exactly when a result leaves the array). `ui.ts` renders the gallery (now: whole-tile click → edit, centered Edit affordance, top-right delete) and owns no engine logic. `index.ts` orchestrates. A new `license.ts` reads `import.meta.env.VITE_CESDK_LICENSE` and both engines spread `license` in only when present.

**Tech Stack:** Vanilla TypeScript + Vite, CE.SDK. No test suite (project policy — CLAUDE.md). Verification = `npm run check:syntax` (`tsc --noEmit`) + a browser check on the `multicrop-dev` preview server (run by the controller; implementers do edits + check:syntax + commit only).

---

## Verification note (read first)

This project has **no automated tests** — a deliberate user decision in
`CLAUDE.md`. Do **not** add a test framework or unit tests. Each task is verified
by `npm run check:syntax` (must report no errors). Behavioral/browser
verification is performed by the controller after the implementer commits — do
**not** start the dev server from an implementer subagent.

Secret handling: **never read `.env`.** The license variable name
(`VITE_CESDK_LICENSE`) is already known and used only via `import.meta.env`.

## File structure

| File | Change |
| --- | --- |
| `src/app/license.ts` | **New.** Reads `import.meta.env.VITE_CESDK_LICENSE`; exports `CESDK_LICENSE`, `CESDK_USER_ID`. |
| `src/app/editor.ts` | Pass `license` to `CreativeEditorSDK.create` when present; use `CESDK_USER_ID`. |
| `src/app/renderer.ts` | Pass `license` + `userId` to `CreativeEngine.init` when present. |
| `src/app/state.ts` | Add `removeResult(id)`, `clearAllResults()`. |
| `src/app/ui.ts` | `renderGallery(results, onEdit, onDelete)` (whole-tile edit, centered Edit hint, top-right delete); add `removeTile(id)`, `setGenerateNote(text)`. |
| `index.html` | Tile CSS (cursor, hover overlay + Edit pill, `.delete-btn`); `Delete all` button + `.danger` style. |
| `src/index.ts` | `handleDelete`, additive `handleGenerate`, `handleDeleteAll`, upload confirm, wiring. |

Tasks are ordered so the build stays green after each commit.

---

### Task 1: License wiring

**Files:**
- Create: `src/app/license.ts`
- Modify: `src/app/editor.ts` (the `CreativeEditorSDK.create` call ~line 40)
- Modify: `src/app/renderer.ts` (the `CreativeEngine.init` call ~line 21)

- [ ] **Step 1: Create `src/app/license.ts`**

```ts
/**
 * CE.SDK license + user id. The license is read from Vite's build-time env
 * (`VITE_CESDK_LICENSE`); when absent the engines run unlicensed (trial
 * watermark) and the demo still works. The value flows in via `import.meta.env`
 * (typed through tsconfig's `"types": ["vite/client"]`) — the `.env` file is
 * never read by app code.
 */
export const CESDK_LICENSE = import.meta.env.VITE_CESDK_LICENSE as
  | string
  | undefined;

/** Shared CE.SDK user id, passed to both engines. */
export const CESDK_USER_ID = 'multicrop-demo-user';
```

- [ ] **Step 2: Wire the license into the editor**

In `src/app/editor.ts`, add the import near the top (after the existing
`configureCropEditor` import):

```ts
import { CESDK_LICENSE, CESDK_USER_ID } from './license';
```

Replace the create call:

```ts
    const cesdk = await CreativeEditorSDK.create('#cesdk_container', {
      userId: 'multicrop-demo-user'
    });
```

with:

```ts
    const cesdk = await CreativeEditorSDK.create('#cesdk_container', {
      userId: CESDK_USER_ID,
      ...(CESDK_LICENSE ? { license: CESDK_LICENSE } : {})
    });
```

- [ ] **Step 3: Wire the license into the headless renderer**

In `src/app/renderer.ts`, add the import after the existing imports (e.g. after
`import type { CropResult } from './state';`):

```ts
import { CESDK_LICENSE, CESDK_USER_ID } from './license';
```

Replace the init call:

```ts
    enginePromise = CreativeEngine.init({
      baseURL: `https://cdn.img.ly/packages/imgly/cesdk-engine/${CreativeEngine.version}/assets`
    });
```

with:

```ts
    enginePromise = CreativeEngine.init({
      baseURL: `https://cdn.img.ly/packages/imgly/cesdk-engine/${CreativeEngine.version}/assets`,
      ...(CESDK_LICENSE
        ? { license: CESDK_LICENSE, userId: CESDK_USER_ID }
        : {})
    });
```

- [ ] **Step 4: Verify the build is green**

Run: `npm run check:syntax`
Expected: no errors. (`license`/`userId` are known config properties; spreading
only when present keeps the no-key path identical to today.)

- [ ] **Step 5: Commit**

```bash
git add src/app/license.ts src/app/editor.ts src/app/renderer.ts
git commit -m "feat: wire CE.SDK license from VITE_CESDK_LICENSE when present"
```

---

### Task 2: Per-tile delete + whole-box click-to-edit

**Files:**
- Modify: `src/app/state.ts` (add two helpers at the end)
- Modify: `src/app/ui.ts` (`renderGallery`; add `removeTile`)
- Modify: `index.html` (tile CSS in `<style>`)
- Modify: `src/index.ts` (add `handleDelete`; pass it to `renderGallery`; imports)

- [ ] **Step 1: Add state helpers in `src/app/state.ts`**

Append after the existing `setThumbnail` function:

```ts
/** Remove a result by id, revoking its thumbnail URL. Returns true if removed. */
export function removeResult(id: string): boolean {
  const index = state.results.findIndex((r) => r.id === id);
  if (index === -1) return false;
  const [removed] = state.results.splice(index, 1);
  URL.revokeObjectURL(removed.thumbnailUrl);
  return true;
}

/** Remove every result, revoking all thumbnail URLs. */
export function clearAllResults(): void {
  for (const r of state.results) URL.revokeObjectURL(r.thumbnailUrl);
  state.results = [];
}
```

- [ ] **Step 2: Rewrite `renderGallery` and add `removeTile` in `src/app/ui.ts`**

Replace the whole `renderGallery` function:

```ts
/** Render the gallery from results, wiring each Edit button via `onEdit`. */
export function renderGallery(
  results: CropResult[],
  onEdit: (id: string) => void
): void {
  const gallery = $('gallery');
  gallery.innerHTML = '';

  // Shared scale across the batch so thumbnail sizes are comparable.
  const maxSide = Math.max(1, ...results.flatMap((r) => [r.width, r.height]));
  const scale = THUMB_MAX_SIDE / maxSide;

  for (const result of results) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;

    // Fixed-size stage; the thumbnail is scaled to its relative size + centered.
    const stage = document.createElement('div');
    stage.className = 'stage';

    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;
    img.style.width = `${Math.max(THUMB_MIN_SIDE, Math.round(result.width * scale))}px`;
    img.style.height = `${Math.max(THUMB_MIN_SIDE, Math.round(result.height * scale))}px`;
    stage.appendChild(img);

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = `${result.presetLabel} · ${result.width}×${result.height}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => onEdit(result.id));

    tile.append(stage, caption, editBtn);
    gallery.appendChild(tile);
  }
  $('results-panel').classList.remove('hidden');
}
```

with this — the whole tile is the edit click target, the centered Edit pill is a
hover affordance, and a top-right delete button stops propagation so it never
also opens the editor:

```ts
/**
 * Render the gallery from results. The whole tile is the click-to-edit target
 * (`onEdit`); a centered "Edit" pill appears on hover as the affordance. A
 * top-right ✕ deletes that version (`onDelete`) — its handler stops propagation
 * so deleting never also opens the editor.
 */
export function renderGallery(
  results: CropResult[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void
): void {
  const gallery = $('gallery');
  gallery.innerHTML = '';

  // Shared scale across the batch so thumbnail sizes are comparable.
  const maxSide = Math.max(1, ...results.flatMap((r) => [r.width, r.height]));
  const scale = THUMB_MAX_SIDE / maxSide;

  for (const result of results) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.resultId = result.id;
    tile.addEventListener('click', () => onEdit(result.id));

    // Fixed-size stage; the thumbnail is scaled to its relative size + centered.
    const stage = document.createElement('div');
    stage.className = 'stage';

    const img = document.createElement('img');
    img.src = result.thumbnailUrl;
    img.alt = result.presetLabel;
    img.style.width = `${Math.max(THUMB_MIN_SIDE, Math.round(result.width * scale))}px`;
    img.style.height = `${Math.max(THUMB_MIN_SIDE, Math.round(result.height * scale))}px`;
    stage.appendChild(img);

    // Centered hover affordance (a clear "this box is clickable" cue). No own
    // click handler — clicks bubble to the tile's edit handler.
    const editHint = document.createElement('div');
    editHint.className = 'edit-hint';
    const editPill = document.createElement('span');
    editPill.textContent = 'Edit';
    editHint.appendChild(editPill);
    stage.appendChild(editHint);

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = `${result.presetLabel} · ${result.width}×${result.height}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete ${result.presetLabel}`);
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(result.id);
    });

    tile.append(stage, caption, deleteBtn);
    gallery.appendChild(tile);
  }
  $('results-panel').classList.remove('hidden');
}

/** Remove a single tile by id; hide the results panel if none remain. */
export function removeTile(id: string): void {
  document.querySelector(`.tile[data-result-id="${id}"]`)?.remove();
  if ($('gallery').children.length === 0) {
    $('results-panel').classList.add('hidden');
  }
}
```

- [ ] **Step 3: Update tile CSS in `index.html`**

In the `<style>` block, replace these two rules:

```css
      .tile .edit-btn { position: absolute; inset: 0 0 auto auto; margin: 8px; opacity: 0; transition: opacity .12s; }
      .tile:hover .edit-btn { opacity: 1; }
```

with (note: also add `cursor: pointer` to `.tile` and `position: relative` to
`.tile .stage`):

```css
      .tile .edit-hint { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(15,17,21,.45); opacity: 0; transition: opacity .12s; }
      .tile .edit-hint span { background: var(--accent); color: #fff; font-weight: 600; padding: 6px 14px; border-radius: 8px; }
      .tile:hover .edit-hint { opacity: 1; }
      .tile .delete-btn { position: absolute; top: 0; right: 0; margin: 8px; z-index: 1; padding: 2px 9px; background: rgba(185,28,28,.92); border-radius: 6px; opacity: 0; transition: opacity .12s; }
      .tile:hover .delete-btn { opacity: 1; }
```

Then update the `.tile` rule to add `cursor: pointer;`:

```css
      .tile { position: relative; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; }
```

And the `.tile .stage` rule to add `position: relative;`:

```css
      .tile .stage { position: relative; height: 200px; display: flex; align-items: center; justify-content: center; background: #000; }
```

- [ ] **Step 4: Add `handleDelete` and update imports + the `renderGallery` call in `src/index.ts`**

Update the state import:

```ts
import { findResult, setThumbnail, state } from './app/state';
```

to:

```ts
import {
  findResult,
  removeResult,
  setThumbnail,
  state
} from './app/state';
```

Update the ui import to add `removeTile`:

```ts
import {
  clearResults,
  removeTile,
  renderGallery,
  renderSizeList,
  selectedPresetIds,
  setGenerating,
  setUploadedImage,
  updateTile,
  wireSelectionToGenerate
} from './app/ui';
```

Add a `handleDelete` function (place it next to `handleEdit`):

```ts
function handleDelete(id: string): void {
  if (removeResult(id)) removeTile(id);
}
```

In `handleGenerate`, update the existing `renderGallery(results, handleEdit);`
call to pass the delete handler:

```ts
    renderGallery(results, handleEdit, handleDelete);
```

- [ ] **Step 5: Verify the build is green**

Run: `npm run check:syntax`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/state.ts src/app/ui.ts index.html src/index.ts
git commit -m "feat: whole-tile click-to-edit + per-tile delete in the gallery"
```

---

### Task 3: Additive re-generate + delete-all + upload confirm

**Files:**
- Modify: `src/app/ui.ts` (add `setGenerateNote`)
- Modify: `index.html` (`Delete all` button + `.danger` style)
- Modify: `src/index.ts` (additive `handleGenerate`, `handleDeleteAll`, upload confirm, wiring, imports)

- [ ] **Step 1: Add `setGenerateNote` in `src/app/ui.ts`**

Add after `setGenerating`:

```ts
/** Show a short note in the generate-status area (e.g. nothing new to do). */
export function setGenerateNote(text: string): void {
  $('generate-status').textContent = text;
}
```

- [ ] **Step 2: Add the `Delete all` button + `.danger` style in `index.html`**

Replace the results-bar row:

```html
        <div class="row" style="margin-bottom: 16px;">
          <strong>Generated crops</strong>
          <button id="download-all-btn" class="secondary" style="margin-left:auto;">Download all (.zip)</button>
        </div>
```

with:

```html
        <div class="row" style="margin-bottom: 16px;">
          <strong>Generated crops</strong>
          <button id="delete-all-btn" class="danger" style="margin-left:auto;">Delete all</button>
          <button id="download-all-btn" class="secondary">Download all (.zip)</button>
        </div>
```

Add a `.danger` button style right after the `button.secondary` rule:

```css
      button.danger { background: #b91c1c; }
```

- [ ] **Step 3: Make `handleGenerate` additive in `src/index.ts`**

Replace the whole `handleGenerate` function:

```ts
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
    renderGallery(results, handleEdit, handleDelete);
  } finally {
    setGenerating(false);
  }
}
```

with this — generate only the selected presets that don't already have a
version, and append (never revoke/replace existing versions or their edits):

```ts
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
```

- [ ] **Step 4: Add `handleDeleteAll` and the upload confirm in `src/index.ts`**

Update the state import to add `clearAllResults`:

```ts
import {
  clearAllResults,
  findResult,
  removeResult,
  setThumbnail,
  state
} from './app/state';
```

Update the ui import to add `setGenerateNote`:

```ts
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
```

Add a `handleDeleteAll` function (next to `handleDelete`):

```ts
function handleDeleteAll(): void {
  const count = state.results.length;
  if (count === 0) return;
  if (!window.confirm(`Delete all ${count} versions? This can't be undone.`)) {
    return;
  }
  clearAllResults();
  clearResults();
}
```

Replace the body of `handleUpload`:

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

with this — confirm before wiping existing versions, and reuse
`clearAllResults()` for the reset:

```ts
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
```

- [ ] **Step 5: Wire the `Delete all` button in `main()`**

Next to the existing `download-all-btn` listener in `main()`, add:

```ts
  document
    .getElementById('delete-all-btn')!
    .addEventListener('click', handleDeleteAll);
```

- [ ] **Step 6: Verify the build is green**

Run: `npm run check:syntax`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/ui.ts index.html src/index.ts
git commit -m "feat: additive re-generate + delete-all + upload confirm"
```

---

## Self-review

**Spec coverage:**
- A (per-tile delete + whole-box click-to-edit, centered Edit, top-right delete
  with stopPropagation) → Task 2 (Steps 1–4). ✓
- B (additive, non-overwriting generate; skip-existing; "already generated"
  note; no revoke on generate) → Task 3 Steps 1, 3. ✓
- C (Delete all + confirm) → Task 3 Steps 2, 4, 5. ✓
- D (upload confirm; cancel resets input + keeps state; reuse `clearAllResults`)
  → Task 3 Step 4. ✓
- E (license from `VITE_CESDK_LICENSE`, spread when present, both engines) →
  Task 1. ✓
- Object-URL invariant (revoke on delete/delete-all/upload-wipe; not on
  generate) → `removeResult`/`clearAllResults` (Task 2 Step 1) used in Tasks 2 &
  3; generate's revoke loop removed (Task 3 Step 3). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type/name consistency:**
- `renderGallery(results, onEdit, onDelete)` defined in Task 2 Step 2; the only
  caller (`handleGenerate`) passes `handleDelete` in Task 2 Step 4 and again in
  the additive rewrite (Task 3 Step 3). ✓
- `removeResult`/`clearAllResults` defined in Task 2 Step 1; imported/used in
  Task 2 Step 4 (`removeResult`) and Task 3 Step 4 (`clearAllResults`). ✓
- `removeTile` defined Task 2 Step 2, used Task 2 Step 4. `setGenerateNote`
  defined Task 3 Step 1, used Task 3 Step 3. ✓
- `CESDK_LICENSE`/`CESDK_USER_ID` defined in Task 1 Step 1; imported in editor +
  renderer (Steps 2, 3). ✓
- `.edit-hint`/`.delete-btn`/`.danger` CSS classes (Task 2 Step 3, Task 3 Step 2)
  match the class names set in `ui.ts`/markup. The old `.edit-btn` rules are
  fully replaced; `ui.ts` no longer creates an `edit-btn`. ✓
