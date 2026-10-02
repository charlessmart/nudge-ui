# ADR-0030: Project-local HTML studies

Date: 2026-09-30
Status: Accepted
Supersedes: ADR-0029

## Decision

Duplicate a live Canvas frame as another live view of the same application and
pending edits. A duplicated frame can be unlinked. Unlink captures its rendered
DOM and CSS as a standalone HTML study, then gives that frame an independent edit
draft. It does not create another application build or development server.

The host stores each study under `.nudge/artifacts/<id>/`: `baseline.html` is the
original capture, `preview.html` is the most recently committed editing base,
`document.html` is the latest saved rendering, and `metadata.json` records
source route and viewport. `.nudge` is
ignored by Git. The shared host route confines reads and writes to generated
artifact IDs under that directory. A failed capture leaves the duplicate live.

The iframe renderer remains the editing surface. A study has no application
scripts or React state. The browser capture preserves the visible DOM, form
values, computed layout and typography, stylesheets, and retrievable assets.
Unsupported content such as cross-origin frames, inaccessible assets, and
tainted canvases can lose fidelity. Nudge does not present the artifact as a
running copy of the application.

Prompt handoff references the source route, current study, and baseline. The
agent implements the requested design in application source. The study remains
available for comparison. Prompt handoff no longer creates screenshot
checkpoints or freezes a comparison frame. Existing screenshot frames remain
readable until explicitly removed; no migration pretends they are HTML studies.

This preserves Nudge's quick edit workflow while allowing editable alternatives
without taking ownership of the application's full source history.
