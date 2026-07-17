# 0028 — Tailwind v3 token conformance adapter

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a designer working in a Tailwind v3 application, I can inspect a utility
color and its opacity as a meaningful theme token even though Tailwind v3 uses
JavaScript configuration and generated helper variables rather than Tailwind
v4's CSS-first theme contract.

## What to build

Add a Tailwind v3 adapter and fixture set independent from the Tailwind v4
path. Detect a v3 project, load its supported configuration safely, and map
generated utility declarations to their config-derived theme tokens. Cover
the common color-plus-opacity form that uses Tailwind v3 helper variables such
as `--tw-bg-opacity`.

The adapter must contribute provenance to the common token inventory rather
than introducing a separate inspector experience. It may treat unsupported
plugins, executable/dynamic configuration, and arbitrary values as raw or
lower-confidence results with an explicit diagnostic.

## Acceptance criteria

- [ ] A minimal Tailwind v3 fixture compiles through Vite and is detected as
      Tailwind v3 rather than v4.
- [ ] A configured theme color resolves to a human-readable token/config path
      from a generated utility class.
- [ ] A v3 opacity helper is reported as a base color token plus alpha modifier
      without flattening to a computed color string.
- [ ] The inspector exposes source/provenance and editability accurately; a
      project config token is distinct from a framework default.
- [ ] Dynamic config and unsupported plugin output fail safely with a raw or
      lower-confidence result, not a crash or invented mapping.
- [ ] Unit tests and browser conformance tests cover detection, config token
      mapping, opacity, and unsupported fallback behavior.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

- #0024 — Token conformance harness and standard-CSS baseline corpus
- #0025 — Preserve functional token values and classify edit capability
