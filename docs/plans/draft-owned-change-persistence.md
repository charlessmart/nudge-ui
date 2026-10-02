# Plan: draft-owned change records (single source of truth)

Status: Plan only — not implemented. Applies to the canvas feature work on
`codex/draft-version-history` and supersedes parts of the session persistence
described in ADR-0027/0029 once the drafts/studies feature lands.

## Problem

Serialized change records are persisted three times, and restored twice:

1. `canvas/sessionStore.ts` (localStorage `nudge-ui:{projectId}:v13`,
   `changes` + `structuralChanges` fields) — written on every change commit
   via autosave; restored by `hydrateSession` → `loadWorkspaceChanges`.
2. `history/store.ts` (localStorage `nudge-ui-history:{projectId}:v1`,
   `drafts[].contents.{changes,structuralChanges}`) — the per-card draft copy,
   written by `syncActiveDraft` on the same change commits.
3. `prompt/clipboardHandoff.ts` (inside the session, `clipboardHandoff`
   fingerprints) — a fingerprint of the exported records, not a copy of intent.

Two restore paths call `loadWorkspaceChanges`:

- `hydrateSession` (sessionStore.ts) restores the workspace from the session's
  own `changes`/`structuralChanges` copy.
- `activateDraftForCard` (history/store.ts) restores from the draft's contents
  on first activation — reconciled with the session copy by the
  "adopt-if-pristine" heuristic (`store.ts` first-activation branch: if the
  stored draft is pristine and the live workspace already holds intent, adopt
  the live workspace instead of overwriting).

Consequences:

- The same records are serialized twice per commit (session + draft), and two
  code paths must agree about which copy is authoritative. The heuristic exists
  only because they drift.
- Draft activation calls `loadWorkspaceChanges`, which clears the canonical
  undo/redo stacks (`workspaceChanges.ts` restore path). Switching drafts
  silently destroys undo history.
- The clipboard fingerprint path (3) re-fingerprints the same records a third
  time; it is only meaningful for the live-frame manual copy flow and
  self-prunes for study flows, so it is not a persistence owner and stays as-is.

## Target architecture

**The draft store (`history/`) is the single durable owner of change records.**

- Each canvas card has a draft reference (`cardDrafts`/`frameContents` in the
  history store) that is already durable.
- The session (`sessionStore`) persists: cards with geometry and linked-group
  identity, camera, mode, focused card id, clipboard-handoff state — **not**
  the change bytes. It stores only `frameContents`-style references, or simply
  relies on the history store being initialized from the same card list.
- Restore becomes:
  1. `hydrateSession` restores cards/camera/mode/focused id (no changes).
  2. `initializeVersionHistory(projectId, cardIds)` loads draft metadata and
     associates cards with drafts (already happens in `CanvasWorkspace`).
  3. `activateDraftForCard(focusedCardId)` restores changes from the active
     draft — the **single** `loadWorkspaceChanges` call on startup.

This removes the adoption heuristic entirely: the workspace is never restored
from the session, so there is no second copy to reconcile.

## Steps

### 1. Session schema v14: drop `changes`/`structuralChanges` fields

- `sessionStore.ts`: remove `changes`/`structuralChanges` from
  `DurableSession`, from `buildSession`, and from `hydrateSession` validation
  and deserialization.
- Bump `SCHEMA_VERSION` 13 → 14 (previous shapes intentionally incompatible).
- `hydrateSession` no longer restores the workspace; it returns
  `changeCount: 0` (or a pristine-workspace marker) and lets history restore.
- Keep `clipboardHandoff` in the session (it is transport/verification state,
  not intent).

### 2. Draft activation owns startup restore

- `CanvasWorkspace` already calls `initializeVersionHistory` + (effectively)
  `activateDraftForCard` for the selected/focused/primary card. Make the
  activation unconditional on startup (currently it needs a selected/focused
  card; fall back to `cards[0]`).
- `sessionStore.test.ts` "restores changes from a hydrated session" tests are
  rewritten to assert: hydration restores geometry, history activation
  restores intent, and the two compose in order.
- Adopt-if-pristine branch in `activateDraftForCard` can be deleted once no
  other path populates the workspace before activation. Verify with the
  session-restore fixture tests (`sessionStore.test.ts` draft/study cases and
  `m4-canvas-*` dev specs that reload the page).

### 3. Undo survives draft switches

- `changesLog.loadWorkspaceChanges` → `workspaceChangeStore.restoreWorkspaceChanges`
  clears undo/redo stacks. Add a restore mode that installs a fresh
  undo baseline *for the activated draft* instead of clearing: e.g.,
  `loadWorkspaceChanges(changes, structural, { preserveUndo: true })` seeds the
  stacks with the previous draft's records so Ctrl-Z returns to the prior
  draft's state rather than nothing.
- Intent on interaction: undo should be per-draft editing session (ADR-0029:
  "Undo belongs to a draft's editing session; it does not delete checkpoints").
  Simplest correct behavior: switching drafts seals the current draft's undo
  stack and opens an empty one for the new draft — undo after a switch undoes
  edits made *in that draft* only. Keep it explicit and tested.

### 4. Fail-closed startup ordering

- Guard: if history fails to initialize (malformed metadata), fall back to a
  fresh shared draft (`ensureCards` already creates one) rather than showing an
  empty workspace. `hydrateSession` already `safeDiscard()`s malformed
  sessions; the draft store has the same try/catch semantics.

### 5. Cleanup after the migration

- Delete the adoption branch, the session change-serialization codecs usage in
  `buildSession`, and dead tests.
- The history localStorage schema (`nudge-ui-history:{projectId}:v1`) keeps
  `schemaVersion: 1` — drafts/contents shape is unchanged; the session schema
  bump carries the migration. (Alternatively bump history to v2 and drop
  `notes`/`sketches: []` payload fields that checkpoints used to populate —
  optional; decide whether `DraftContents.sketches` stays as an always-empty
  schema-compat field or is removed with a v2 migration.)

## Out of scope

- `clipboardHandoff` fingerprints stay (live-frame verification hint).
- Sketch ownership (`sketchDrafts`) stays in the draft store; sketch image
  bytes remain in the sketch IndexedDB.
- Undo/redo storage format is unchanged; only restore semantics on draft
  switch change.

## Risks

- **Restore-order regressions**: hydration currently restores intent before
  renderer frames project; the new order (cards → drafts → activate → project)
  must keep `projectToAllReadyCards()` after activation.
- **Demo mode**: `CanvasWorkspace` initializes history for the demo runtime
  too; if the session stops storing changes, the demo's starter edits must
  still restore. Decide demo behavior in the same change (either seed a demo
  draft or gate history on the write lease — see the lease-gap finding).
- **Test surface**: `sessionStore.test.ts`, `canvasStore.test.ts`,
  `history/store.test.ts`, and the `m4-canvas-*` Playwright specs that reload
  sessions are the safety net; run them as one batch.