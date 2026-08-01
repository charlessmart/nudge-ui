# 11 — Prompt generator

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

A "Copy prompt" button that reads the changes log from #10 and generates a structured markdown prompt optimised for AI coding agent consumption. The prompt includes:

- A **framework + styling-system detection header** so the agent knows it's vanilla-extract, Tailwind, plain CSS vars, etc. (read from the adapter registry / token-table adapter field)
- **Per-change blocks** grouped by component, each with: component name, file:line (from `data-src`), property, before→after, token name if applicable
- **Grep-ready selector fallback** when source mapping is uncertain — `[data-cid="..."][data-src*="..."]` selectors the agent can grep by
- A **compact format** — no dumping entire CSS blocks; just the deltas

Writes the prompt to the clipboard on click.

## Acceptance criteria

- [x] "Copy prompt" button reads the changes log and generates structured markdown
- [x] Prompt starts with a framework + styling-system detection header
- [x] Each change rendered as: component name, file:line, property, before→after, token name (if applicable)
- [x] Changes grouped by component in the prompt
- [x] When `data-src` source mapping is uncertain/absent, prompt includes grep-ready `[data-cid="..."]` selector fallback
- [x] Prompt is compact (no full CSS block dumps — deltas only)
- [x] Clicking "Copy prompt" writes the generated markdown to the clipboard
- [x] Empty changes log produces a clear "no changes to export" state, not a malformed prompt

## Blocked by

- #10 — Changes log + single-change revert