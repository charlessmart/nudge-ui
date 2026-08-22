# 0060 — Inspector onClick handlers dead under Next 16 shadow-root mount

**Labels:** bug, needs-triage
**Type:** AFK
**Milestone:** 4 — Next.js host adapter (ADR-0010)

## User story

As a developer using Design Tool inside a Next.js 16 (Turbopack, React 19
canary) application, I can click inspector controls — collapse, tokens tab,
copy prompt, accordions — and the panel responds, exactly as it does under
the Vite host.

## Observed behavior

Under `examples/sandbox-next` (Next 16.3.2, React 19.3.0-canary via Next,
inspector mounted with `createRoot(shadowRoot)` from `DesignToolMount`):

- Rendering, styles, and state-driven attributes are correct; the panel is
  fully visible and styled.
- React `onChange` flows work (raw-value edits apply through the managed
  stylesheet and persist).
- React `onClick` handlers never fire — for trusted Playwright clicks and
  for synthetic `element.click()` dispatches alike. Native listeners added
  directly on the same element also do not fire for `.click()`, while a
  manual `dispatchEvent(new MouseEvent("click", { bubbles: true }))` does
  reach them.
- CDP shows React 19's delegated `click` listeners present on the shadow
  root (capture and bubble), and the clicked element carries React fiber
  keys. No console errors or page errors occur.
- Selection of host-application elements works (document-capture path in
  `elementSelector`), so the failure is specific to events dispatched
  *inside* the shadow tree reaching React's shadow-root delegation.

## Suspected cause

React 19-canary event delegation for a `createRoot(shadowRoot)` container
does not dispatch `click` (pointer-activation) events to component handlers
in this environment, while `change` delegation works. The Vite host is
unaffected (React 18.3, same architecture, same spec interactions pass).

## Investigation notes (2026-08-22 session)

- Two-React hypothesis eliminated: with the wrapper's
  `turbopack.resolveAlias` pinning `react`/`react-dom` to the host project's
  copies, both the mount and the shell report the identical React version.
- Workspace-lease lockouts were observed in early probes and are a separate,
  expected behavior (single-writer ownership); the dead-click reproduces on
  a cleanly acquired lease with the real panel mounted.
- jsdom unit coverage cannot see this: jsdom's `.click()` composes events,
  so shadow-internal interactions behave differently there.

## Acceptance criteria

- [ ] Clicking the collapse button sets the panel to closed.
- [ ] Clicking the tokens tab renders the tokens panel.
- [ ] Copy-prompt writes the generated prompt to the clipboard after a
      change exists.
- [ ] `examples/sandbox-next` tracer spec covers all three without skips.
- [ ] The Vite and standalone hosts remain green (no regression).

## References

- ADR-0010 (Next.js host Adapter)
- `packages/nextjs/src/mount.tsx` (shadow-root mount)
- `examples/sandbox-next/tests/tracer.dev.spec.ts` (prompt-copy spec carries
  an explicit skip pending this fix)
