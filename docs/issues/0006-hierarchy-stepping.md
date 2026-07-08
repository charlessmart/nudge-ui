# 6 — Hierarchy stepping

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

Add breadcrumb-style hierarchy stepping to the element selector from #5. When an element is selected, arrow up/down walks between the clicked DOM node and its enclosing component boundary (the nearest ancestor with a distinct `data-cid`).

This resolves the core ambiguity of click-to-select: "did they mean the DOM node they clicked, or the React component that rendered it?" Like Chrome DevTools' breadcrumb, but component-aware — stepping moves between DOM nodes and component boundaries, not just DOM parents.

## Acceptance criteria

- [ ] Arrow up moves selection to the enclosing component boundary (nearest ancestor with a different `data-cid`)
- [ ] Arrow down moves selection back toward the originally clicked DOM node
- [ ] Stepping never escapes the host app DOM into the inspector's Shadow DOM
- [ ] Current position in the hierarchy is shown as a breadcrumb in the inspector
- [ ] Each breadcrumb step updates the selected element identity (`data-cid` / `data-src`) shown in the inspector
- [ ] When the originally clicked node has no enclosing component with a distinct `data-cid`, stepping is a no-op with clear indication

## Blocked by

- #5 — Element selector: hover highlight + click-to-select