# 0032 — Link-discovered route cards and edit handoff

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer previewing one route, I can follow local navigation into new live
cards, interact with each page, and promote any card to become the single
editable Inspect route.

## What to build

Extend the one-card Canvas into a same-origin route collection. A primary,
unmodified activation of a same-origin link whose pathname or search differs
adds or focuses a card instead of navigating the source frame. Preserve
same-document hash scrolling and ordinary non-navigation interactions.

Normalize route identity by origin + pathname + search for link-driven
deduplication. Add a card toolbar with title/route, Edit, Reload, Duplicate and
Remove. Duplicate deliberately bypasses deduplication so the same route can
hold independent responsive or application states.

Edit saves the board, sets Inspect mode before top-level navigation, and
restores the canonical projection on the destination. Editing the current
top-level route simply exits Canvas. Report programmatic in-frame navigation so
card metadata follows its actual URL. Keep cross-origin destinations outside
the Canvas workspace and surface redirected cross-origin frames as recoverable
errors.

## Acceptance criteria

- [ ] Entering Canvas adds the current Inspect route when absent and focuses it when already present
- [ ] Eligible same-origin anchor activation prevents source-card navigation and creates a card to the right
- [ ] A second activation of the same normalized pathname + search focuses the existing card
- [ ] Same-document hash links retain normal in-frame scrolling
- [ ] Modifier clicks, downloads, non-HTTP schemes and explicitly targeted links retain appropriate browser behavior
- [ ] Ordinary external `_self` navigation leaves the Canvas workspace instead of stranding an inaccessible card
- [ ] Buttons, menus, forms, text selection and other unmodified iframe interactions remain usable
- [ ] Programmatic same-card navigation updates the card URL/title after the renderer reports it
- [ ] Card chrome provides accessible Edit, Reload, Duplicate and Remove actions
- [ ] Duplicate creates a distinct card ID and independent iframe even for the same normalized route
- [ ] Remove affects only the chosen card and never removes the last route without returning to a valid baseline
- [ ] Edit sets mode before top-level navigation, preserves the board, and makes exactly one route editable
- [ ] Navigating to the already active Inspect route exits Canvas without reloading the host document
- [ ] Unit tests cover URL normalization, link eligibility, deduplication and card actions
- [ ] Playwright covers two discovered routes, usable host controls, duplicate/remove, and edit handoff
- [ ] Production output contains no route interception or Canvas card code
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0031 — Shared edit projection across preview documents

