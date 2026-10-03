# Page-scoped handoff: behavior and review notes

Live frames now own pending changes by page URL. Breakpoints showing the same
page share one draft; other pages and HTML studies have independent drafts.
Selection controls the Changes list, prompt count, sketches, and generated
handoff. Application prompts include the originating URL.

A handoff captures its draft, target, and exact records before asynchronous work.
Completion looks for a live preview of that original page. Reconciliation removes
only unchanged records whose source-rendered result can be verified. Switching
pages or making a newer edit never authorizes clearing another draft. Navigating
back restores that page's pending intent; undo can return a navigated frame to
its originating page.

## Cases to review

- If every preview of the sent page has navigated away or been removed when the
  agent finishes, completion can miss verification. Pending changes remain.
  Reopen the original page and review or clear them manually. Copied handoffs can
  retry verification as the original preview refreshes or regains focus.
- Reloading while a connected agent is working preserves pending drafts, but
  its exact sent snapshot is currently held in memory. Completion after reload
  can leave implemented edits pending. Review or resend the remaining changes.
- Shared components and global tokens can change several pages in application
  source. Drafts and previews remain page-scoped; implementing one request may
  also satisfy or conflict with another page's pending request. The prompt calls
  out shared source, and reconciliation remains conservative.
- URL query values define separate pages; query order, hashes, directory index
  aliases, and the editor parameter do not. Different component states at the
  same URL share a draft. Hash-based client routing and state fixtures need a
  separate design if they become important.
- Rendered output cannot reliably prove every component property, interaction
  state, structural move, or off-screen target. Uncertain records remain pending.
  Agent completion and verified implementation remain separate states.
- Existing sessions with one shared application draft lack per-change page
  provenance. That draft is retained on its first available live page; other
  pages start empty. Users may need to move or clear older mixed-page intent.
- Navigation preserves existing frame arrangements. If one breakpoint
  navigates elsewhere, its section can contain different pages; each frame
  shows the draft for its current URL. Automatic regrouping or navigating all
  linked breakpoints together remains a UX decision.
- The connected agent handles one request at a time. Its working status remains
  visible when selecting another page; that page's Changes list and count still
  show only its own work.
- Written agent instructions remain project-wide settings. Sketch notes and
  pending visual edits follow their page or study.

## Verification

Regression checks cover separate page drafts, linked breakpoints, navigation
while an agent request is pending, returning to the original page, URL identity,
exact-record reconciliation, and page-specific prompt generation in the browser.
