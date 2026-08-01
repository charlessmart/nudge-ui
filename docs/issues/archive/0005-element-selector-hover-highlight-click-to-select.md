# 5 — Element selector: hover highlight + click-to-select

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

The first interactive loop in the inspector. When the inspector is active:

- Hover over host-app elements → an outline overlay (rendered in the Shadow DOM, positioned over the target element) highlights the element under the cursor
- Click → selects the element, resolving it to its `data-cid` / `data-src` / `data-cprops` identity attributes (and any fiber data available via `_debugSource` / `__source`)
- Selected element's identity is surfaced in the inspector shell so later slices (token panel, changes log) can consume it

The hover overlay must not interfere with the host app's layout (positioned absolutely, pointer-events handled so the click reaches the real element). This is the foundation slice 6 (hierarchy stepping) and slice 7 (token resolution) build on.

## Acceptance criteria

- [x] Hovering host-app elements shows an outline overlay positioned exactly over the target
- [x] Overlay is rendered inside the Shadow DOM (doesn't pollute host DOM)
- [x] Overlay does not cause layout shifts in the host app (absolute positioning, no reflow)
- [x] Clicking a host element selects it and resolves its `data-cid`, `data-src`, `data-cprops` attributes
- [x] When `__source` / `_debugSource` fiber data is available, it's captured alongside the attribute identity
- [x] Selected element identity is displayed in the inspector (component name, file:line)
- [x] Inspector does not select its own Shadow DOM elements (scoped to host app DOM)

## Blocked by

- #4 — Shadow DOM mount point + inspector shell + toggle shortcut
- #2 — `data-src` + `data-cprops` injection