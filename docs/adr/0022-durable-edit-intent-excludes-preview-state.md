# ADR-0022: Durable edit intent excludes preview and gesture state

Date: 2026-09-13
Status: Accepted

## Context

The inspector observes rendered DOM; the agent edits source. A durable record —
what is written to session storage, what undo and redo replay, and what crosses
the prompt handoff — therefore has to describe the requested change and the
evidence needed to interpret it. A rendered structural change does not always
identify the source mechanism that should implement it.

Two payloads currently mix preview concerns with durable records:

- `previewResult` on `ElementChangeRecord` and `TokenChangeRecord`, which records
  what the browser painted after the managed stylesheet was projected.
- `StructuralMove.presentation` (`sourceParentTag`, `destinationParentTag`,
  `fromIndex`, `toIndex`), which records the gesture that produced a move so the
  preview can replay it.

Preview outcomes and gesture replay state are transient. Structural presentation
fields must be assessed individually: retain any evidence needed to interpret
the requested relationship, and move replay-only fields out of durable intent.
Today, `agent/verification.ts` strips `previewResult`
by destructuring it out before computing a handoff fingerprint. The prompt
generator deliberately ignores `presentation` and states that it exports final
intent rather than gesture history. Every new field on a durable record is
another opportunity for a consumer to forget.

Preview outcomes are also per-document in reality — an inspected document and
each Canvas renderer can reach different results for the same change — but they
are stored in a single field. Updating that field without inventing user intent
requires a special write path that replaces records while suppressing the
canonical revision.

The tool has no users, so the stored session shape may change freely.

## Decision

1. **A durable record carries the requested change and evidence needed to
   interpret it**: target identity, target scope, baseline values, and relevant
   source or rendered evidence. Document-derived evidence can be durable;
   live DOM objects and the current execution state cannot. The same intent
   supports preview, undo/redo, persistence, and agent handoff without claiming
   a source implementation that the browser cannot establish.

2. **Preview outcomes, gesture replay state, and verification execution state
   are not durable-record fields.** Each has an explicit owner and lifetime.
   Preview diagnostics identify the edit revision, logical document, and current
   document session and verification attempt. A diagnostic never enters undo
   history or advances the canonical revision. Accept results only for the
   currently applicable edit and projection in an active document session;
   reject results from superseded attempts or disposed sessions. Comparing only
   with the last stored diagnostic is insufficient.

3. **The edit payload crossing the preview-to-source handoff is derived from
   durable intent by construction.** Consumers do not remove transient state to
   recover intent. Transport metadata, such as request and workspace revision
   identifiers, remains separate from the edit payload. Prompt formatting may select relevant evidence or omit
   irrelevant durable fields; it does not define which fields are canonical.

4. **While the tool has no users, no session-data compatibility window is
   maintained.** The stored shape may change without migration, and previous
   incompatible session data is discarded rather than migrated. Retain an
   explicit current schema identifier and validation for malformed or unsupported
   data. Removing migration support does not remove validation. This item is
   expected to be superseded by a compatibility ADR once the tool has users;
   the other three items are independent of it.

## Consequences

- The canonical store no longer needs a non-canonical write path that replaces
  records without advancing the revision.
- The handoff fingerprint uses deterministic serialization of durable intent. The
  prompt path no longer needs to know that a field exists purely to ignore it.
- Preview diagnostics become observable per document, so the inspected document
  and each Canvas renderer can report different outcomes for one change at the
  same time.
- Deleting migration removes the legacy record types, the multi-version read
  path, and migration-only branches. Current-schema validation and safe discard
  behavior remain. An upgrade with an incompatible schema loses the stored
  session; it does not attempt a partial restore.
- ADR-0020's commit settlement is unchanged and remains protected. The commit
  result stays three-valued (`applied`, `unchanged`, `blocked`) and `blocked`
  stays distinguishable from `unchanged`, because a rejected commit restores the
  draft rather than discarding it.

## Verification

- Two Canvas documents produce different diagnostics for one change
  simultaneously.
- A diagnostic for a superseded edit is rejected even when no newer diagnostic
  has arrived. Results from an earlier document session or superseded attempt
  are also rejected, including after a Canvas card reload retains its card ID.
- Adding a preview-only field requires no change in `agent/verification.ts` or
  `prompt/generatePrompt.ts`.
- Agent tests pass with the destructuring removed from the handoff fingerprint.
- Inline-text tests continue to cover a blocked commit restoring the draft.
- Durable target evidence survives serialization and handoff; transient preview
  and gesture state does not affect the handoff fingerprint.
- Malformed and incompatible stored sessions are safely discarded; a valid
  current-schema session restores without migration.
