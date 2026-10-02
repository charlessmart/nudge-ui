# ADR-0031: Linked frames and study handoff

Date: 2026-10-01
Status: Accepted
Supersedes: ADR-0030

## Decision

Live duplicates share an edit draft and a durable linked frame group. The canvas
places duplicates immediately after their source, moves overlapping neighbors
right, and exposes one accent surface drag bar for each group. Individual linked
frames remain selectable and resizable, but move only through the group bar.
Unlink captures an independent HTML study, compacts the remaining group, and
centers the canvas on the detached study.

HTML study prompts direct agents to edit the study's `document.html`. Captured
source locations identify elements but do not authorize editing application
source. Baseline and preview files remain managed by Nudge. Studies check for
external document changes and reload after promoting them to the preview base,
provided no inspector edits are pending. The same flow supports clipboard,
connected-agent, and sketch fallback prompts.

Implementing a study in application source is deferred to a separate future
handoff action. Live application frames retain their existing source-edit flow.
