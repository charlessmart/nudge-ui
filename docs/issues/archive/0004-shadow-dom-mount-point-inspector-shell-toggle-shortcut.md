# 4 — Shadow DOM mount point + inspector shell + toggle shortcut

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 2 — Core loop

## Parent

PLAN.md Milestone 2 — Core loop.

## What to build

Lay down the inspector UI architecture. The Vite plugin injects a `<div id="design-tool-root">` mount point into the document body in dev mode only. The inspector renders into this as a Shadow DOM React portal, fully isolated from host app CSS — host styles can't leak in or out.

React strategy (the HITL decision in this slice): first attempt aliasing the inspector's `react` import to the host app's React via Vite config so there's a single React instance at runtime. If version mismatch causes issues, fall back to bundling a separate React into the Shadow DOM (~40KB gzipped). Document the chosen approach in an ADR.

Wire the keyboard shortcut `Alt+I` to toggle inspector visibility on/off. No inspector surfaces yet — just the shell, mount point, toggle, and the CSS-isolation guarantee.

## Acceptance criteria

- [x] Vite plugin injects `<div id="design-tool-root">` into document body in dev mode only
- [x] Inspector mounts as a Shadow DOM React portal in the mount point
- [x] Shadow DOM is CSS-isolated: host app styles do not leak into the inspector; inspector styles do not leak into the host
- [x] `Alt+I` toggles inspector visibility (open/close)
- [x] Inspector mount point and portal absent in production build (tree-shaking verified)
- [x] React-strategy decision documented in an ADR (alias vs bundle)
- [x] Inspector shell renders an empty panel (placeholder) so later slices have a surface to populate

## Blocked by

- #1 — Vite plugin scaffold + sandbox app + `data-cid` injection