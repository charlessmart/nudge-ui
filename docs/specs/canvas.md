# Nudge canvas: product spec

Scope: the canvas experience on `codex/draft-version-history`.

## User need

Developers and designers need to see their actual app, compare pages and screen
sizes, explore alternatives, and give a coding agent precise visual instructions.
They should be able to move between these tasks without losing pending work or
confusing an experiment with the live app.

## What users work with

| Item | User expectation |
| --- | --- |
| Live frame | A running app page at a chosen viewport size. Visual edits become instructions for changes to application source. |
| Linked frames | Multiple live views of the same page that share pending edits. Useful for responsive comparison. |
| HTML study | An independent HTML variation captured from a frame, including its current visual edits. Further edits target that study’s HTML file. |
| Sketch note | A drawing or annotation over a frame, with optional written instructions, that communicates intent to the agent. |

## Main flows

### 1. Start with the app, then spread out

Open Nudge on the current page in **Focus** view. Switch to **Canvas** to pan,
zoom, arrange frames, and resize their viewports. Focus any frame for detailed
work, then return to the same canvas arrangement. Use **Use app normally**, or
hold Shift on the canvas, to interact with the page instead of selecting elements
for editing.

### 2. Compare responsive layouts and related pages

Use **Add linked frame** on a live frame to compare the same page at another
width. Edits appear across linked views; each viewport can be resized separately,
and the group moves together.

Use **Add pages** to search framework-discovered routes, select several, and add
them as a grid below existing frames. This requires no Nudge configuration.
Discovery covers Next.js pages, Astro pages, and Vite/static HTML entry pages.
Dynamic route patterns are shown but require a concrete URL before they can be
added. Arbitrary client router definitions are outside current discovery.

### 3. Explore an independent alternative

Choose **Variation**, or Option/Alt-drag a frame’s top bar, to capture an HTML
study. Keep the original live frame and its linked views available for comparison.
Edit and resize the study independently, or create further variations from it.
Clearly label live frames and HTML studies so the user knows where agent edits
will go. A study preserves a rendered design; it does not reproduce the app’s
full behavior or automatically apply changes back to application source.

### 4. Make the intended change visible

Select elements to preview supported style, token, component-property, and
structural changes. Double-click text to edit it inline. Each independent study
keeps its own pending changes; switching frames preserves other drafts.

Use Pencil to draw over a frame and add a note. Keep drawings visible with the
relevant frame, and let users inspect, copy, or delete sketch notes. Combine
precise visual edits with sketches when the desired result needs explanation.

### 5. Hand off and understand the agent’s progress

Send the active draft’s changes, sketch images, and instructions to a connected
agent. Otherwise, copy the prompt and sketch images for manual handoff. Live
frame requests target application source; study requests target the study’s HTML
file. Save the study’s pending changes before preparing its handoff.

Show **Agent working…** and an animated border beam around affected frames.
When the agent reports file activity, show reading/editing context and a gradient
shimmer over identifiable components being edited. These temporary indicators
describe activity; task completion remains a separate, authoritative state. The
agent can also bring affected pages onto the canvas for review.

### 6. Review, recover, and continue

Refresh previews as changes arrive without interrupting active text edits.
Reconcile completed changes while retaining unapplied changes and newer user
edits. Keep work available when dispatch or saving fails, and surface study save
conflicts instead of silently overwriting changes. Remove activity indicators
when the task ends or disconnects.

Use one session undo/redo timeline for visual edits and frame creation across
drafts. Undo automatically focuses the relevant frame; adding a page grid is one
undo step. Restore the canvas arrangement, focused frame, and pending drafts
after reload. Clearing pending changes preserves frames; **Reset canvas** is a
separate action. Only one browser tab owns editing at a time.

## Current boundaries

The canvas is a development workspace. Nudge previews intent and hands it to an
agent; it does not directly edit application source. Session undo is not a saved
version archive. Named immutable versions, component-state fixtures, Storybook
integration, and automatic promotion of studies into app source are deferred.
