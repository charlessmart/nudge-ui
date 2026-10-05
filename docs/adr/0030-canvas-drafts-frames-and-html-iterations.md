# ADR-0030: Canvas drafts, frames, and HTML iterations

Date: 2026-10-03
Status: Accepted
Supersedes: ADR-0027's session ownership of edit intent and its frame identity

## Context

ADR-0027 stores one workspace of pending edits in the session and treats every
frame as a live view of the application. Canvas now shows several pages, linked
breakpoints, and editable HTML alternatives at once. Each needs its own pending
edits, prompt, sketches, and undo steps, while geometry and rendering stay
separate from edit ownership.

## Decision

### Frames and content

A frame owns geometry, title, and an optional frame group. It references a
discriminated content identity: a live route URL or an HTML iteration ID.
Content selects the rendered document, refresh policy, and edit destination.
Iteration provenance does not identify a live route.

Frame groups are durable and agent-owned. The connected agent creates them
when presenting pages and removes them when dismissing them; a group also
vanishes when its last frame is removed. Frames move and resize independently;
membership does not determine edit ownership.

### Drafts are derived from content

A draft holds pending ordinary and structural edits for one edit target. Its
ID is the target key, so frame content alone determines the draft:

- A route frame edits the application page at its normalized URL. Query values
  define separate pages. Query order, hashes, directory index aliases, and the
  editor parameter do not.
- An iteration frame edits `.nudge/artifacts/<id>/document.html`.

Frames showing the same page share one draft, so breakpoints stay consistent.
Other pages and every iteration have independent drafts. Navigating a frame
switches it to the destination page's draft; navigating back restores the
original page's edits. No frame-to-draft association is stored, so it cannot
drift from frame content.

Selection activates the selected frame's draft. That draft controls the Changes
list, prompt count, sketches, projection diagnostics, and handoff. Application
prompts name the originating page and note that shared source can affect other
pages.

A sketch belongs to the draft whose document it was captured on. A sketch
drawn while another draft is active records that draft as an explicit owner.
A new iteration starts with no edits and no sketches; it never shares a sketch with
its source.

### Persistence

The draft store is the sole durable owner of pending edits. The session stores
geometry, camera, frame groups, focus, and clipboard handoff fingerprints, and
contains no change records. Only drafts with pending edits are stored, with
explicit sketch owners, under the project's draft key. Earlier draft and session
schemas are discarded under ADR-0022.

Starting the workspace controller always replaces in-memory drafts with stored
drafts. A tab that takes over the workspace lease therefore never writes stale
edits over another tab's work. Demo drafts stay in memory and never read or
write project storage. Durable writes obey the workspace lease; the one
exception is adopting an edited inspect URL after hydration, which re-writes
the just-restored session key while draft writes remain lease-gated.

### Undo

One session timeline replays edits and frame creation across drafts and
focuses the relevant frame. Undoing an edit on a page that no frame shows
navigates the originating frame back to that page. Removing the last frame for
a draft discards that draft's undo steps; trashing an iteration's last frame
also discards its draft, while undoing an iteration's creation keeps the empty
draft and its artifact until the entry leaves the timeline. Adding several
agent-presented pages as a grid is one timeline entry.

### HTML iterations

Creating an iteration captures the rendered DOM and CSS of a frame into a
standalone HTML document. It leaves the source frame and its linked copies in
place. Button-created iterations appear below the source frame; Option/Alt-drag
places one at the drop position. Iterations can be the source of further
iterations.

The host stores each iteration under `.nudge/artifacts/<id>/`, which is ignored by
Git: `baseline.html` is the original capture, `preview.html` is the committed
editing base, `document.html` is the latest saved rendering, and
`metadata.json` records source route and viewport. The host route confines
reads and writes to generated artifact IDs. An iteration has no application scripts
or state. Cross-origin frames, inaccessible assets, and tainted canvases can
lose fidelity.

Iteration prompts direct agents to edit only `document.html`. Captured source
locations identify elements and do not authorize editing application source.
Implementing an iteration in application source is a separate future action.

Pending iteration edits persist as draft intent. Copy prompt or Send prompt
materializes them into HTML before dispatch:

1. Capture waits for an acknowledged projection and pins the draft revision. A
   changed draft or document aborts the handoff and keeps pending edits.
2. A short draft write lock keeps the saved revision stable during file commit.
3. Served previews identify the hash of their editing base. Browser writes
   provide the expected document and preview hashes. The host serializes
   requests per artifact and rejects stale writes. Saving and promoting a
   preview is one host operation; a failed replacement rolls back the preview.
4. External refresh shares the iteration operation queue, waits for no pending
   edits or inline text edit, and promotes the exact revision it observed.

Agents write files directly and do not join the host queue. This is optimistic
concurrency, not a filesystem lock.

### Handoff verification

A handoff captures its draft, target, revision, and exact records before
asynchronous work. Completion verifies against a live preview of the original
page or iteration. Reconciliation removes only unchanged records whose
source-rendered result can be verified. Switching drafts or a newer edit never
authorizes clearing another draft.

### Agent activity

Agent activity is an ephemeral, project- and request-scoped presentation
layer. The companion accepts reports only for the working request. Activity
cannot dispatch, complete, or reconcile a task, and never enters storage or
undo. Reads expire after eight seconds and edits after twelve.

## Consequences

- Draft identity cannot diverge from frame content, and drafts need no
  migration when frames are duplicated, added, or removed.
- Shared components and tokens can change several pages in source while drafts
  stay page-scoped. Implementing one request can satisfy or conflict with
  another page's pending edits; reconciliation stays conservative.
- Different component states at the same URL share a draft. Hash routing and
  state fixtures need a separate design.
- Verification can miss when every preview of the sent page has navigated away
  or the connected agent finishes after a reload. Pending edits remain for
  review or resend.
- No saved-version feature exists. A future one needs immutable identity and
  captured state.
