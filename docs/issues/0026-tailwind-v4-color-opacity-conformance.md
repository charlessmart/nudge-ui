# 0026 — Tailwind v4 color-opacity token attribution

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a designer inspecting a Tailwind v4 utility such as `bg-red-500/10`, I see
the base Tailwind color token and its 10% opacity modifier rather than an
opaque browser-serialized sRGB value. I can understand and safely adjust the
meaningful token-backed color without losing its rendered preview.

## What to build

Extend the working Tailwind v4 token path with a conformance fixture for
color-opacity utilities. Resolve Tailwind's generated color expression (for
example `color-mix()` and any local `--tw-*` composition) into a base global
token plus alpha modifier while retaining the authored declaration and browser
computed color as separate values.

Expose the base token through the existing token-aware color field. Add an
opacity representation/control only where it can round-trip the utility's
semantic alpha value; otherwise show the modifier read-only beside an explicit
raw CSS fallback. Framework default tokens must remain distinguishable from
project-owned editable tokens.

The slice is limited to single-color utilities and opacity. Gradients,
multi-color backgrounds, filters, and arbitrary color expressions remain
composite/raw values.

## Acceptance criteria

- [x] A Tailwind v4 fixture covers a project theme token, a framework default
      color token, and a `/10` color-opacity utility.
- [x] Selecting the opacity utility attributes the base color token and 10%
      alpha separately from its computed browser color.
- [x] The field does not replace the authored utility expression with an sRGB
      serialization.
- [x] Any alpha edit that the UI offers round-trips through the managed
      stylesheet, visible preview, change log, and prompt; unsupported forms
      remain explicit raw fallbacks.
- [x] The fixture covers Tailwind local alias composition when it participates
      in the emitted color declaration.
- [x] Unit and browser conformance tests protect Tailwind v4 token catalog,
      attribution, computed preview, and origin/editability behavior.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

- #0024 — Token conformance harness and standard-CSS baseline corpus
- #0025 — Preserve functional token values and classify edit capability
