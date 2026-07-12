# 0017 — Confidence-aware style attribution

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## What to build

Replace the current "walk every CSS rule and choose a winner" behaviour with a
style-attribution module that keeps three concerns distinct: the contextual
token catalog, authored declaration candidates for the selected element, and
the value actually painted by the browser.

`getComputedStyle()` is the source of truth for the current value. CSSOM rules
are attribution candidates only. The resolver preserves conditional-rule
applicability, selector-branch specificity, source order, importance and
cascade-layer context, then validates candidates against the computed result.
It returns an explicit confidence (`exact`, `probable` or `unknown`) with the
evidence used. If stylesheets are inaccessible or no candidate can be proven,
the inspector shows the computed value and an honest unknown-token state rather
than naming a potentially incorrect token.

The implementation remains browser-based and does not require Chrome DevTools
Protocol, an extension or a live agent connection.

## Acceptance criteria

- [x] Runtime resolution returns painted value, attributed token/declaration when available, confidence and evidence
- [x] The painted value always comes from `getComputedStyle()` rather than a build-time token value
- [x] Inactive media, supports and container-query branches are excluded from winning candidates
- [x] Selector lists use the specificity of the selector branch that actually matched the element
- [x] Source order, `!important`, cascade layers and inline declarations are represented in attribution
- [x] Inherited attribution is attempted only for properties that inherit and does not infer inheritance from equal values alone
- [x] Cross-origin or otherwise inaccessible stylesheets degrade to `unknown` without throwing
- [x] The token panel visibly distinguishes exact, probable and unknown attribution
- [x] Unit tests cover specificity, selector lists, conditional rules, layers, importance, inline declarations and inheritance
- [x] Sandbox e2e coverage demonstrates correct attribution and an explicit unknown fallback
- [x] Production build remains free of inspector and token metadata
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

- #0016 — Contextual token catalog
