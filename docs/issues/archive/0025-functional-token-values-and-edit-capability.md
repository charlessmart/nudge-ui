# 0025 — Preserve functional token values and classify edit capability

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a designer inspecting an expression such as `var(--space-4, 1rem)` or
`calc(var(--space-4) * 2)`, I see the CSSOM-declared expression and referenced token
without it being replaced by a computed pixel value. The inspector tells me
when its structured controls are safe to use and falls back to raw CSS when
they are not.

## What to build

Extend the shared token-resolution model so declared CSS, token references,
computed browser output, and edit capability are separate facts. Do not expose
the browser's computed serialization as the editable value for expressions.

Support token attribution inside `var()` fallbacks, aliases, `calc()`, `min()`,
`max()`, and `clamp()`. Preserve the complete meaning-bearing expression while
accepting CSSOM normalization of its lexical spelling.
Classify a value at least as `atomic`, `color`, `box-sides`, `structured`,
`composite`, or `raw`; the initial implementation may keep non-supported
categories in an existing raw field rather than adding new editors.

This issue establishes the value-model seam consumed by the Tailwind alpha and
border issues. It does not add complex editors for gradients, shadows,
transforms, backgrounds, fonts, transitions, animations, or grid templates.

## Acceptance criteria

- [x] A resolved inspection value retains its CSSOM-declared expression
      independently from its computed browser value.
- [x] `var(--token, fallback)` exposes the token reference and fallback without
      flattening either into the computed value.
- [x] Alias chains resolve to a known leaf when safe; cycles are reported
      without looping or inventing a value.
- [x] Token references within `calc()`, `min()`, `max()`, and `clamp()` are
      attributed while the declared expression remains editable as raw CSS.
- [x] The resolver supplies a stable edit-capability classification to the
      inspector; unsupported composite values use an explicit raw fallback.
- [x] Unit tests cover each supported function, fallback, alias cycle, and raw
      fallback; conformance fixtures verify authored and computed facts
      separately in a browser.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

- #0024 — Token conformance harness and standard-CSS baseline corpus
