# 0027 — Simple border shorthand decomposition with raw fallback

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a designer selecting an element styled with `border: 2px solid
var(--color-border)`, I can inspect and edit border width, style, and color as
separate meaningful values. When a border cannot be faithfully split, I see
its original raw CSS instead of misleading controls.

## What to build

Teach the value engine to decompose the safe subset of `border` shorthand:
one width, one line style, and one color, including a token-backed color. Feed
the result into a border UI that supports linked sides when their effective
values match and independent side editing when an authored side override is
present.

Retain the shorthand's authored form for attribution and prompt context. An
edit may write the focused longhand property through the managed stylesheet;
it must not silently rewrite source or imply that all four sides were changed.

Treat `border-image`, multi-layer/ambiguous values, inheritance keywords,
unresolved complex expressions, and unsupported logical-side combinations as
raw fallbacks. Border radius remains separate CSS and is explicitly out of
scope for this slice.

## Acceptance criteria

- [x] `border: <width> <style> <color>` decomposes into width, style, and color
      with independent token attribution where applicable.
- [x] A token-backed border color remains linked to its token rather than being
      replaced with a computed RGB string.
- [x] The border editor exposes linked effective sides and an independent-side
      path when an authored side override exists.
- [x] Editing one structured border value updates only the intended managed
      stylesheet longhand and retains a coherent change-log/prompt record.
- [x] Unsupported/ambiguous border values render as raw CSS without false
      decomposition.
- [x] Unit cases cover shorthand order permutations, token colors, side
      overrides, and fallbacks; browser fixtures verify preview and inspector
      behavior.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

- #0024 — Token conformance harness and standard-CSS baseline corpus
- #0025 — Preserve functional token values and classify edit capability
