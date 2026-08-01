# 7 — Runtime token resolution for selected element

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

For the currently selected element, walk its computed styles. For every CSS property whose value resolves through `var(--something)`:

1. Resolve the custom property through the cascade to find its declaration site
2. Match the resolved name against the build-time token table from #3
3. Present the token name (not the resolved value) in a token panel surface in the inspector

If a computed value doesn't resolve to a known token (hardcoded value, unknown custom property), show the raw value with a "not a token" indicator. This handles elements with hardcoded values instead of token references — honest about the gap, and sets up the "replace with token" affordance in #8.

This is the read-only half of the token panel; #8 adds the edit loop on top.

## Acceptance criteria

- [x] Inspector walks `getComputedStyle` for the selected element
- [x] For each property using `var(--x)`, the custom property is resolved through the cascade to its declaration
- [x] Resolved custom property name is matched against the build-time token table from #3
- [x] Token panel displays: property name, token name (if matched), resolved value
- [x] Properties with values that don't resolve to a known token show the raw value with a "not a token" indicator
- [x] Token panel updates when the selected element changes (including hierarchy stepping from #6)
- [x] Performance acceptable: computing the panel for one element doesn't jank the page (debounced, scoped to the selection)

## Blocked by

- #3 — Token table parser + virtual module
- #5 — Element selector: hover highlight + click-to-select