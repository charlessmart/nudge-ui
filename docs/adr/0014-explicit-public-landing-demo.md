# ADR-0014: Explicit public landing demo artifact

- Status: Accepted
- Date: 2026-09-02
- Supersedes: ADR-0002 for the explicitly configured landing demo artifact only

## Context

The public Nudge UI landing page needs to demonstrate the actual inspector. A
static imitation does not prove that the inspector can operate inside a page,
but the normal product build must continue to have no inspector runtime.

## Decision

The repository provides a separate `examples/landing` application. Its Vite
configuration opts into `nudgeUi({ demo: true })`, and its deployment build
uses the explicit `nudge-demo` mode. In that mode only, the plugin emits the
identity transform, token modules, and inspector bootstrap needed by the
landing demo.

During development, the landing app also receives the normal Vite HTML
injection, so the marketing page itself can be edited with the inspector. The
generated runtime selects that normal mode for the parent page and selects the
demo mode when the URL contains `?nudgeDemo=1`. The landing page uses that URL
in a same-origin iframe. The demo runtime sets `demo: true`, disables Canvas,
skips the workspace lease and persistence, and keeps the agent bridge inert.
The static landing build imports the runtime only for the flagged iframe; the
normal plugin configuration and every build that does not use both opt-in
values remain governed by ADR-0002.

## Consequences

- The landing deployment can show the real inspector without changing the
  production behavior of applications that use Nudge UI.
- The demo artifact contains inspector code by design and must not be used as a
  host application's production build.
- The URL flag is part of the demo boundary: the parent landing page is inert,
  while the embedded frame is interactive.
