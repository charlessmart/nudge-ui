# 13 — vanilla-extract resolveClassName + verify on work codebase

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 3 — vanilla-extract adapter

## What to build

Complete the vanilla-extract adapter from #12 with the optional `resolveClassName` method and do the end-to-end verification on the actual work codebase (the real testbed).

`resolveClassName(cls: string)` maps a vanilla-extract-generated class name back to its theme contract path, so the token panel can resolve sprinkles-generated utility classes to their human-readable token (e.g. `sprinkles({ color: 'brand' })` → `theme.color.brand`).

Then verify the full vertical path on the real work app: click an element → token panel shows `theme.color.brand` (not `--color-brand__1g5vs1s0`) → edit by swapping tokens → copy prompt → prompt references `theme.color.brand` (the thing an agent can `grep` for in source, not a hashed var it can't find).

This is the milestone-3 acceptance demo: the tool is genuinely useful on its primary target codebase.

## Acceptance criteria

- [ ] vanilla-extract adapter implements `resolveClassName(cls)` returning the theme contract path for sprinkles-generated classes
- [ ] On the work codebase: clicking an element shows human-readable token names (`theme.color.brand`) in the token panel, not hashed CSS vars
- [ ] Editing a token swap (e.g. `theme.color.brand` → `theme.color.accent`) updates the element live on the work codebase
- [ ] Generated prompt from #11 references `theme.color.brand` (human-readable), greppable in the work codebase source
- [ ] End-to-end demo recorded or documented: select → see token → edit → copy prompt → prompt names the theme contract path the agent can act on
- [ ] Adapter handles the work codebase's actual sprinkles/theme contract shapes without hardcoded special cases

## Blocked by

- #12 — vanilla-extract adapter: detect + token extraction
- #8 — Token panel edit loop + managed stylesheet