# 8 — Token panel edit loop + managed stylesheet

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 2 — Core loop

## What to build

The core value loop of the tool. The token panel shows resolved tokens for the selected element (from #7), each with a dropdown of alternative tokens of the same type (color tokens swap with color tokens, spacing with spacing, etc.). Selecting a new token:

1. Writes a rule to a single managed `<style id="design-tool-styles">` element injected into the document head — **never an inline style**
2. The rule is keyed by `[data-cid="..."][data-src*="..."]` (component identity + source location), not DOM selectors
3. The element updates live — the user sees the change immediately

Also add a "replace with token" affordance for hardcoded ("not a token") values from #7, letting the user pick a token to replace a hardcoded value with.

HITL because: (a) the managed-stylesheet rule format is a hard architectural constraint (React clobbers inline styles on re-render; the external stylesheet survives — this is a documented hard rule in PLAN.md), and (b) the token-swap UX (dropdown grouping, live preview) is the product's central interaction.

## Acceptance criteria

- [x] A single `<style id="design-tool-styles">` element is injected into document head (one only, reused across edits)
- [x] Every style edit writes a rule to the managed stylesheet — zero inline styles written to tracked elements
- [x] Rules keyed by `[data-cid="..."][data-src*="..."]`, not fragile DOM selectors
- [x] Token panel shows a dropdown of alternative tokens grouped by type (color, spacing, etc.) for each resolved token property
- [x] Selecting an alternative token writes a rule and the element updates live without a full reload
- [x] "Not a token" values have a "replace with token" affordance that promotes a hardcoded value to a token reference
- [x] Edits survive React re-renders (managed stylesheet is external to the React tree)
- [x] ADR records the managed-stylesheet + no-inline-style rule and the rationale

## Blocked by

- #7 — Runtime token resolution for selected element