# ADR-0002: Dev-only gating of all inspector transforms

Date: 2026-07-08
Status: Accepted

## Context

PLAN.md key constraint #2: "Tree-shaking must be airtight. All plugin transforms
and inspector injection must be gated behind `import.meta.env.DEV`. One stray
import that isn't dev-gated ships an inspector into production." This is a hard
rule because the tool is dev-only and ships nothing to the host's users.

## Decision

Every code path that injects `data-cid` / `data-src` / `data-cprops`,
initialises the inspector, mounts the Shadow DOM portal, parses tokens at runtime,
or writes to the managed stylesheet MUST be guarded by `import.meta.env.DEV`.

The Vite plugin applies the AST transform only in `serve` mode (dev server),
never in `build` mode. The transform returns early when `!import.meta.env.DEV`.
The virtual module `virtual:design-tokens` resolves to an empty token table in
production builds so the inspector has nothing to consume and remains inert.

## Consequences

- Production builds: zero `data-*` injected attributes, no inspector mount point,
  empty token table, no Shadow DOM portal — bytes added are negligible.
- The verification workflow must include a production build at every milestone
  (see `pnpm --filter sandbox build`).
- Any subsequent transform added in a later milestone inherits this guard.

## Verification

- `pnpm --filter sandbox build` produces a `dist/` whose HTML/JS contains no
  `data-cid` / `data-src` / `data-cprops` attributes.
- Playwright e2e asserts the absence over a production-built static server.