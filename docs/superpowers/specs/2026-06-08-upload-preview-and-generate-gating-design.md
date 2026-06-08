# MultiCrop — Upload Preview + Generate Gating (Design)

**Date:** 2026-06-08
**Status:** Approved (not yet implemented)

## Goal

Two small UX fixes to the app shell:

1. **Gate Generate on an uploaded image.** Today the sizes panel renders at
   startup, so a user can tick sizes and enable **Generate** before any image
   exists; clicking it then silently no-ops (`handleGenerate` returns early at
   `src/index.ts` when `state.sourceURI == null`). Generate must stay disabled
   until **both** an image is uploaded **and** ≥1 size is selected.
2. **Show an inline upload preview.** After upload, only the filename appears.
   Add a small (~64px-tall) thumbnail of the uploaded image to the upload row,
   between the **Upload image** button and the filename.

No engine, crop, renderer, or scene changes. This is shell-only
(`index.html`, `src/app/ui.ts`, `src/index.ts`).

## Change 1 — Generate gating

The enable/disable condition is currently duplicated in two places in
`src/app/ui.ts` (`wireSelectionToGenerate` on checkbox change, and
`setGenerating`) and considers only checkbox selection + generating state.

Consolidate into a single private `refreshGenerate()` helper, the one source of
truth for the button's `disabled`:

```
disabled = isGenerating || !hasImage || selectedPresetIds().length === 0
```

- `isGenerating` and `hasImage` become module-level flags in `ui.ts`.
- `wireSelectionToGenerate` attaches `refreshGenerate` to the `#sizes` change
  event (replacing its inline condition).
- `setGenerating(value)` sets `isGenerating = value`, updates the spinner/status
  text, and calls `refreshGenerate()` (replacing its inline condition).
- The orchestrator flips `hasImage` to `true` on a successful upload (see
  Change 2's `setUploadedImage`).

Net behavior: the button is disabled at startup (already `disabled` in markup),
stays disabled while only sizes are selected, and enables once an image exists
**and** a size is ticked — removing today's click-with-no-image no-op.

## Change 2 — Inline upload preview

- **Markup (`index.html`):** add `<img id="upload-preview" class="hidden"
  alt="Upload preview" />` to the upload row, positioned between the Upload
  button and `#upload-name`.
- **CSS (`index.html`):** ~64px tall, width auto (aspect preserved) with a
  modest `max-width`, `1px` border + small radius, dark-theme consistent. The
  global `.hidden { display: none !important }` keeps it hidden until first
  upload.
- **Source URL:** the preview's `src` is the existing `state.sourceURI` blob URL
  — **no new object URL is created.** Re-upload already revokes the old
  `sourceURI` and creates a new one *before* the preview `src` is reassigned, so
  the preview always points at a live URL. Object-URL lifetime rules (§7 of
  `CLAUDE.md`) are unaffected; nothing new to revoke.

### Post-upload UI consolidation

Replace `setUploadName(name)` with `setUploadedImage(name, previewUrl)` in
`ui.ts`, called once from `handleUpload` (`src/index.ts`). It performs the three
post-upload UI updates together:

1. set the filename text,
2. set the preview `<img>` `src` and unhide it,
3. set `hasImage = true` and call `refreshGenerate()`.

Bundling display + button state in one function matches the file's existing
style (`setGenerating` already does both).

## Data flow (unchanged)

Upload → (revoke old `sourceURI`, create new) → read natural size →
`setUploadedImage` updates filename + preview + enables Generate when a size is
also picked → Generate → gallery → … Everything downstream of upload is
untouched.

## Risks & verification

No automated tests (project policy). Verification is `npm run check:syntax` plus
a browser check:

1. **Startup:** Generate disabled; ticking sizes alone does **not** enable it.
2. **Upload:** preview thumbnail appears next to the filename; with a size
   ticked, Generate enables. With no size ticked, it stays disabled.
3. **Re-upload:** preview swaps to the new image; no console errors; previously
   shown results are cleared (existing behavior).
4. **Generate:** still disables during generation (spinner) and re-enables after.

## Out of scope

- No "remove image" / clear-upload control (re-upload replaces it).
- Preview is not clickable to re-upload (Upload button remains the trigger).
- No changes to engine, crop editor, renderer, scene, or download paths.
