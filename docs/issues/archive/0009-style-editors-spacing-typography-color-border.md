# 9 — Style editors (spacing, typography, color, border)

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

Style editors that work beyond tokens — for properties the user wants to tweak as raw values, then optionally promote to tokens. Four editor surfaces, all writing through the managed stylesheet from #8 (never inline):

- **Spacing box** — Figma-style: padding and margin with per-side controls (top/right/bottom/left)
- **Typography** — font-size, weight, line-height, letter-spacing
- **Color picker** — with a site-palette dropdown sourced from the token table (same color tokens)
- **Border, radius, shadow**

Each editor reads the current value from the selected element's computed styles and writes edits as managed-stylesheet rules keyed by `data-cid` + `data-src`.

## Acceptance criteria

- [x] Spacing box editor renders padding + margin with per-side numeric controls, updates live
- [x] Typography editor controls font-size, weight, line-height, letter-spacing; updates live
- [x] Color picker offers a palette dropdown sourced from color tokens in the token table
- [x] Border, radius, shadow editors control their respective properties; updates live
- [x] All edits go through the managed stylesheet (no inline styles)
- [x] All edits are keyed by `data-cid` + `data-src` (same identity rules as #8)
- [x] Editors read current values from the selected element's computed styles on selection

## Blocked by

- #8 — Token panel edit loop + managed stylesheet