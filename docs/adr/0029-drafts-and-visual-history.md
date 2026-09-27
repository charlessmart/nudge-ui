# ADR-0029: Drafts and visual history

Date: 2026-09-27
Status: Accepted

## Scope

Introduce independent design drafts and screenshot-based history through one
controller-owned history module. The first implementation covers draft forking,
per-frame projection, checkpoint persistence, prompt handoff capture, static
snapshot frames, and a compact history browser.

If adopted, this extends ADR-0027's workspace intent ownership to multiple drafts
and its live-frame model to include static history views. The same-origin iframe
renderer remains the editing surface. Historical checkpoints do not preserve or
restore application source, arbitrary application state, or backend data.

## Ownership

- A **frame** owns canvas position and viewport. A separate content association
  selects either a live draft or a checkpoint view. Several live frames can show
  one draft, such as desktop and mobile previews.
- A **draft** owns complete pending edits, structural changes, sketches, and notes.
  Duplicating as an alternative copies intent into an independent draft. It does
  not duplicate source code or arbitrary iframe state.
- A **checkpoint** owns an immutable copy of intent and one or more viewport
  screenshots. Its parent records ancestry, not source compatibility.
- A **handoff** connects an exact proposal checkpoint and exported prompt to
  delivery and review state. The implemented result is a separate checkpoint.

Durable changes reuse the existing serializable change model, not runtime token
objects or DOM references. Sketches retain their layers and both original and
annotated images. Checkpoints retain those assets after the sketch queue or
pending edit records are cleared. Readonly types document ownership; the future
implementation must also detach inputs and protect returned values at runtime.

## Interface and persistence

`inspector/history/model.ts` defines metadata. `contracts.ts` defines the target
module interface. `store.ts` owns the current browser implementation and the
workflow functions used by canvas and prompt adapters.

The module owns draft revisions, capture coordination, durable publication, and
handoff associations. Callers do not independently write checkpoint metadata and
image assets. A checkpoint succeeds only after its images are durable. A capture
must match the requested draft revision and acknowledged frame projection;
navigation or a revision change during capture invalidates that capture.

Use project-scoped IndexedDB storage for metadata and immutable image blobs.
Do not put image data URLs in the localStorage workspace session. Initial storage
work must define validation, schema migration, quotas, and failure behavior.
Persistence failure must never be presented as a saved version. Unreferenced
capture assets can be reclaimed; referenced historical assets cannot be deleted
by ordinary edit reconciliation or sketch queue cleanup.

Existing workspace leasing still gates mutations. History uses serializable
intent, while the active draft's runtime change store supplies projection and
undo. Undo belongs to a draft's editing session; it does not delete checkpoints.
The first integration must route all change dimensions, diagnostics, and
verification through draft identity, rather than filtering only CSS by frame.

## Copy and implementation workflow

1. Prepare a handoff from explicit draft revisions. Save proposal and comparison
   checkpoints plus the exact prompt as one durable operation. Generate the prompt
   from those pinned revisions, not a later read of the active workspace.
2. Copy or send through the existing transport. Record delivery only after it
   succeeds. A prepared handoff remains retryable if clipboard or transport fails.
3. For a duplicated alternative, switch the designated original comparison frame
   to its saved screenshot after successful export. Keep the selected draft live.
   Keep the live association available for **Show live app**. Do not freeze
   unrelated alternatives or delete frames automatically.
4. Capture the source-rendered result separately, without preview overrides
   disguising unimplemented changes. Associate it with the handoff for review.
5. Clear only pending changes positively verified against that handoff and draft
   revision. User acceptance can acknowledge subjective sketch intent; it must
   not silently clear unverified structured edits. Preserve proposal and result.

The UI labels static views **Snapshot** and editable frames **Live**. Copy remains
a one-click action with a saved-version confirmation. It explains that agent
implementation changes shared source. If saving fails, retain the live frames
and offer retry or explicit export without history; never silently claim safety.

History timestamps are Unix milliseconds. Image dimensions describe pixels;
viewport and scroll coordinates describe CSS pixels. Initial captures preserve
the visible viewport, not the whole scrollable page.

## Source changes and historical reuse

Live alternatives still load shared application source. Applying one proposal
can invalidate another draft's targets. Keep its checkpoint and require review
before carrying its pending edits onto updated source. An old checkpoint can be
viewed or used as a reference; replaying old edits is not source restoration.

No automatic merge, source checkout, runnable historical build, event sourcing,
or agent-created route variant is included in this increment.

## Next increments

1. Implement and test project-scoped draft/checkpoint storage, immutable assets,
   atomic publication, revision conflicts, and failure recovery.
2. Route workspace edits, projection, undo, sketches, and session restore by draft;
   then connect frame duplication and static snapshot rendering.
3. Connect checkpoint preparation to copy/send and draft-aware reconciliation.
4. Add history browsing and proposal/result comparison.

The existing session schema remains unchanged until runtime integration includes
an explicit migration. Current global handoff fingerprints and sketch revisions
remain transport/verification details, not permanent history identities.
