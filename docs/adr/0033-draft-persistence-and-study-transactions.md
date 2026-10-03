# ADR-0033: Draft-owned persistence and revision-checked study handoff

Date: 2026-10-02
Status: Accepted
Supersedes: ADR-0027's session ownership of edit intent and ADR-0032's inherited study save and refresh coordination.

## Context

The session and draft stores both persist complete pending edits. Restoring the
session and then activating a draft requires an adoption heuristic to reconcile
the two copies. HTML study autosave separately writes a rendered copy to
`document.html`, which agents can edit directly. A later browser capture can
replace an external update without detecting the conflict. Save, promotion,
draft clearing, and reload are coordinated across UI modules.

## Decision

1. The draft store is the sole durable owner of pending ordinary and structural
   edit intent. The session stores canvas geometry, camera, frame metadata, focus,
   and clipboard handoff fingerprints. Session schema 14 intentionally discards
   earlier layouts under ADR-0022; no session-data migration is introduced.
2. Startup restores layout, initializes validated project drafts, activates the
   focused draft (or the first frame), and then projects its intent. Draft
   activation preserves the unified session undo timeline. Demo drafts stay in
   memory and never read or write project draft storage. Durable draft writes
   obey the workspace write lease.
3. Pending study edits autosave as draft intent. They are materialized into HTML
   during Copy prompt or Send prompt, before clipboard or agent dispatch. The
   immutable baseline remains the original capture.
4. One study module owns capture, revision checks, file commit, exact draft
   settlement, and reload. Capture waits for an acknowledged renderer projection
   and pins the originating draft revision. A changed draft or document aborts
   handoff and retains pending intent. A short draft write lock holds the saved
   revision stable during file commit; it is released on success or failure.
5. Served previews identify the hash of the editing base they loaded. Browser
   writes provide the expected document and preview hashes. The host serializes
   requests per artifact, rechecks hashes after preparing temporary files, and
   rejects stale writes. Saving a browser capture and promoting its preview are
   one host operation. A failed document replacement rolls back the preview.
6. External refresh shares the study operation queue, requires no pending intent
   or inline text edit, and promotes the exact document revision it observed.
   An agent remains a direct file writer: external tools do not participate in
   the host's request queue and must finish writing before handoff. This is
   optimistic concurrency, not a filesystem lock across arbitrary processes.

## Verification

- Layout hydration contains no change bytes and cannot replace draft intent.
- Independent drafts and typed edit evidence survive reload through draft storage.
- Malformed draft records or references are rejected before activation.
- Stale and concurrent browser saves preserve external output.
- Edits made during capture remain pending; failed saves release the write lock.
- External refresh defers while editing and cannot race another study operation.
- Browser coverage exercises reload before handoff, successful handoff, conflict
  recovery by creating a variation, and external agent refresh.
