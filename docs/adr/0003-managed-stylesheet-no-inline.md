# ADR-0003: Managed stylesheet; never inline styles

Date: 2026-07-08
Status: Accepted

## Context

PLAN.md key constraint #1 (hard rule): "Never write inline styles to tracked
elements. React clobbers them on re-render." All visual edits the user makes in
the inspector must persist across React re-renders of the host app.

## Decision

The inspector maintains a single `<style id="design-tool-styles">` element
injected into `document.head`. Every style edit produces a CSS rule keyed by
`[data-cid="..."][data-src*="..."]` (component identity + source location), never
an inline `style="..."` attribute on the tracked element.

The stylesheet is a pure function of the changes log: rebuild = iterate log,
emit rules. This keeps revert, undo, and prompt generation tractable.

## Consequences

- Reactive to React re-renders: because the selector keys on stable `data-*`
  attributes React does not own, the rule survives re-renders and reorders.
- DOM selectors that drift (e.g. `:nth-child`-based) are explicitly forbidden
  for keyed edits. They appear only in the prompt generator's grep fallback.
- Future drag/mutation features (#5 / Milestone 5) record-and-replay rather than
  mutate inline in a way React could clobber.

## Verification

- A Playwright e2e (Milestone 2) triggers a re-render (state change in sandbox)
  after an edit and asserts the visual change persists.