# 2 — `data-src` + `data-cprops` injection

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 1 — Foundation

## Parent

PLAN.md Milestone 1 — Foundation.

## What to build

Extend the AST transform from #1 with two more element-identity attributes:

- `data-src` — `file:line:column` sourced from the AST node location (the `__source`-equivalent we own)
- `data-cprops` — serialised primitive props: strings, numbers, booleans rendered as `key:value`; functions rendered as `fn(name)` using the prop name; objects/arrays omitted or summarised

These complete the stable identity layer (`data-cid` + `data-src` + `data-cprops`) that the managed stylesheet, token panel, and prompt generator key off in later milestones. Same dev-only gating, same tree-shaking requirement.

## Acceptance criteria

- [x] AST visitor injects `data-src` as `relative/path/to/File.tsx:line:column` using AST node location
- [x] AST visitor injects `data-cprops` with serialised primitive props (string/number/boolean as `key:value`, functions as `fn(name)`)
- [x] All three attributes (`data-cid`, `data-src`, `data-cprops`) present on JSX elements in dev build
- [x] All three attributes absent in production build (tree-shaking still airtight)
- [x] Verify on sandbox app: props like `variant="primary"` appear as `data-cprops="variant:primary"`
- [x] No transform applied to non-JSX files (plain `.ts` modules untouched)

## Blocked by

- #1 — Vite plugin scaffold + sandbox app + `data-cid` injection