# MultiCrop — Version Management + License Wiring (Design)

**Date:** 2026-06-08
**Status:** Approved (not yet implemented)

## Goal

Make the generated-crops gallery behave like a managed set of versions the user
controls, and remove the trial watermark when a license is available:

- **A.** Each tile is **click-to-edit** (the whole box opens the crop editor),
  with a centered **Edit** affordance on hover and a **Delete (✕)** control in
  the top-right corner.
- **B.** **Re-generate is additive** — generating again keeps existing versions
  and never overwrites them (preserving any edits the user made). Only selected
  presets that don't yet have a result are generated.
- **C.** A **Delete all** button next to **Download all**, with a confirm.
- **D.** Uploading a new image still wipes all versions (already implemented),
  but now **asks for confirmation first**.
- **E.** **Wire the CE.SDK license** from `VITE_CESDK_LICENSE` (when present) to
  both engines, removing the watermark.

No engine/crop/scene logic changes. The headless renderer, scene builder, and
crop editor behavior are untouched.

## A. Per-tile delete + whole-box click-to-edit

Today each `.tile` has an absolutely-positioned **Edit** button in the top-right
that appears on hover (`ui.ts renderGallery`). New behavior:

- The **entire tile** is the click target for editing: clicking anywhere on the
  tile (the stage, the caption) calls `onEdit(id)`. The tile gets
  `cursor: pointer`.
- A centered **Edit** affordance appears on hover — a faint overlay + an "Edit"
  pill centered over the thumbnail — as the visual cue that the box is
  clickable. It has no separate click handler; clicks bubble to the tile.
- A **Delete (✕)** button sits in the top-right, visible on hover, tinted red.
  Its click handler calls `e.stopPropagation()` **before** `onDelete(id)` so
  deleting never also opens the editor.

Single delete is **immediate (no confirm)** — one tile, easily re-generated.
Deleting removes the result from `state.results`, **revokes its thumbnail URL**,
removes just that tile node, and hides the results panel if it was the last one.

## B. Additive re-generate (never overwrite)

`handleGenerate` changes from "replace all" to "append the missing ones":

- Compute `toGenerate` = selected presets whose `id` is **not** already in
  `state.results`. (A result's `id` is the preset id — see `CropResult.id`.)
- If `toGenerate` is empty, show a brief status — "All selected sizes already
  generated" — and return without touching anything.
- Otherwise generate **only** `toGenerate`, then **append** the new results to
  `state.results`. Existing results (and their edited scene strings / thumbnails)
  are left exactly as they are.
- **Object-URL change:** today `handleGenerate` revokes every existing
  thumbnail before replacing `state.results`. That revoke is **removed** — kept
  versions must keep their live thumbnail URLs. Only deletes and new uploads
  revoke thumbnails now.
- The gallery is re-rendered from the full `state.results` (existing + new).
  Re-rendering does not revoke anything, so kept thumbnails stay valid.

The focal point is still computed once per generate, but only when
`toGenerate.length > 0` (skip the saliency pass when there's nothing to make).

## C. Delete all

- Markup: a `Delete all` button in the results bar next to **Download all**
  (`index.html`), secondary style with a destructive tint.
- Handler (`index.ts`): `confirm("Delete all N versions? This can't be undone.")`;
  on confirm, **revoke every thumbnail URL**, empty `state.results`, and clear +
  hide the gallery (reuse `clearResults`). On cancel, do nothing.

## D. Confirm before a wiping upload

`handleUpload` gains a guard at the very top, before any state mutation:

- If `state.results.length > 0`,
  `confirm("Uploading a new image will remove all N current versions. Continue?")`.
- **Cancel** → abort cleanly: reset the file input (`input.value = ''`, so the
  same file can be chosen again later) and return. Current image, preview,
  filename, and versions are all untouched.
- **Confirm** (or no existing results) → proceed exactly as today (revoke old
  source URL + thumbnails, reset results, set new source, update preview).

## E. License wiring

- New module `src/app/license.ts`:
  `export const CESDK_LICENSE = import.meta.env.VITE_CESDK_LICENSE as string | undefined;`
  (`import.meta.env` is typed via `tsconfig`'s `"types": ["vite/client"]`, so this
  compiles; the value is injected by Vite at runtime — **`.env` is never read by
  the app code or by us**.)
- **Editor** (`editor.ts`): pass `license` in the `CreativeEditorSDK.create`
  config when present:
  `{ userId: 'multicrop-demo-user', ...(CESDK_LICENSE ? { license: CESDK_LICENSE } : {}) }`.
- **Renderer** (`renderer.ts`): pass `license` (and `userId` for parity) in
  `CreativeEngine.init`:
  `{ baseURL, ...(CESDK_LICENSE ? { license: CESDK_LICENSE, userId: 'multicrop-demo-user' } : {}) }`.
- Spreading only when present means the no-key path is byte-for-byte the current
  behavior (trial watermark), so nothing breaks when the env var is absent.
- The variable name matches the convention in **both** this repo's and the
  starter kit's `.env.example` (`VITE_CESDK_LICENSE`). The starter kit documents
  the name but does not actually wire it; we add the wiring.

### Security / secret handling

- `.env` is gitignored (verified) and is **never read** by tooling or committed.
- The license name was learned from the committed `.env.example` (key name only);
  the secret value flows only through Vite's `import.meta.env` at runtime.

## State & object-URL lifetime (the recurring gotcha — §7 of CLAUDE.md)

The invariant becomes: **a thumbnail URL is revoked exactly when its result
leaves `state.results`** — i.e. on single delete, delete-all, and the
results-wipe inside a confirmed new upload. Re-generating no longer revokes
anything (kept versions keep their URLs; new versions get fresh URLs). The source
`blob:` URL lifecycle is unchanged.

New `state.ts` helpers (the array + URL lifecycle owner):
- `removeResult(id)` — splice the matching result, revoke its `thumbnailUrl`,
  return whether one was removed.
- `clearAllResults()` — revoke every `thumbnailUrl`, empty the array.

`handleGenerate`'s old "revoke then replace" block is deleted; `handleUpload`'s
results-reset reuses `clearAllResults()`.

## Component changes

| File | Change |
| --- | --- |
| `index.html` | `Delete all` button in results bar; CSS for `cursor:pointer` tile, hover overlay + centered Edit pill, top-right `.delete-btn`. |
| `src/app/license.ts` | **New.** Reads `import.meta.env.VITE_CESDK_LICENSE`. |
| `src/app/state.ts` | Add `removeResult(id)`, `clearAllResults()`. |
| `src/app/ui.ts` | `renderGallery(results, onEdit, onDelete)`: whole-tile click → edit, centered Edit affordance, top-right delete (stopPropagation). Add `removeTile(id)`; brief generate status helper if needed. |
| `src/index.ts` | Additive `handleGenerate`; `handleDelete`, `handleDeleteAll`; upload confirm; wire `delete-all-btn`. |
| `src/app/editor.ts` | Pass `license` to `CreativeEditorSDK.create` when present. |
| `src/app/renderer.ts` | Pass `license` (+ `userId`) to `CreativeEngine.init` when present. |

## Risks & verification

No automated tests (project policy). Gate is `npm run check:syntax` + browser
checks:

1. **Additive generate:** select A+B, Generate → 2 tiles. Select A+B+C (A,B still
   checked), Generate → only C is added; A and B tiles (and any edits) remain,
   and their thumbnails still render (not revoked).
2. **Already-all-generated:** with all selected presets present, Generate shows
   the "already generated" note and adds nothing.
3. **Single delete:** hover a tile → ✕ deletes only that tile; the rest remain;
   clicking the ✕ does **not** open the editor.
4. **Click-to-edit:** clicking anywhere else on a tile opens the crop editor for
   that version.
5. **Delete all:** confirm dialog; on confirm the gallery empties and the panel
   hides; on cancel nothing changes.
6. **Upload confirm:** with versions present, choosing a new file prompts; cancel
   keeps everything (and the same file can be re-picked); confirm wipes + loads.
7. **License:** with the env var present, the editor canvas and exported PNGs
   carry **no watermark** and the console's evaluation banner is gone; with it
   absent, behavior is unchanged (watermark present). Verified in the browser.
8. **No object-URL leaks:** deleted/replaced thumbnails are revoked; kept ones
   are not.

## Out of scope

- No per-tile "regenerate in place" button (delete + Generate is the path).
- No checkbox syncing to already-generated state (checkboxes stay independent).
- No undo for deletes; no persistence.
- No engine/crop/scene/download-logic changes beyond the license option.
