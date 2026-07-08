# 3 — Token table parser + virtual module

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 1 — Foundation

## What to build

Build the token-table pipeline: parse the host project's CSS at build time for custom property definitions and ship them to the runtime via a virtual module the inspector imports.

Sources to parse:
- `:root { --foo: ... }` — standard CSS variables
- `@theme { --foo: ... }` — Tailwind v4
- `@layer` / `@scope` declarations containing custom properties

Ship as virtual module `virtual:design-tokens` exporting a flat map of entries `{ name: string, value: string, source: string, adapter?: string }`, where `source` is the CSS file:line where the variable was declared. The `adapter` field is reserved for Milestone 3 enrichment and left unset by the universal parser.

This is the build-time ground truth the runtime token resolver (Milestone 2) matches against. Without an adapter, the table still contains every `:root`/`@theme` variable in the project.

## Acceptance criteria

- [x] CSS parser walks project CSS files and extracts `:root`, `@theme`, `@layer`, `@scope` custom property declarations
- [x] Token table is a flat map keyed by custom property name, each entry `{ name, value, source, adapter? }`
- [x] `source` field records the CSS file path and line number where the variable was declared
- [x] Virtual module `virtual:design-tokens` is importable from the inspector / sandbox app
- [x] Importing the virtual module returns the populated token table (verifiable with a `console.log` in the sandbox app)
- [x] Token table updates on HMR when CSS files change (no stale tokens after editing CSS)
- [x] No token entries leaked into the production build (virtual module emits empty table or is stripped when not dev)

## Blocked by

- #1 — Vite plugin scaffold + sandbox app + `data-cid` injection