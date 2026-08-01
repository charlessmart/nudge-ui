# 0016 — Contextual token catalog

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## What to build

Replace the flat, last-definition-wins token table with a contextual token
catalog. A token has one stable identity (`cssName`, plus an optional
human-readable name and type) and may have multiple authored declarations.
Each declaration retains its value, source location, selector and enclosing
conditions such as media query, supports rule, scope and cascade layer.

The build-time parser remains an inventory and source-attribution mechanism;
it is not treated as the source of truth for the value currently painted in
the browser. The virtual module exposes the richer catalog in development and
an empty catalog in production. Existing plain `:root` projects continue to
work without configuration.

This slice must be demoable with a sandbox token whose value differs between
the default theme and a dark-theme selector: the inspector catalog contains
one token with both declaration contexts rather than silently overwriting one.

## Acceptance criteria

- [x] The virtual token module exposes token definitions separately from their authored declarations
- [x] Multiple declarations of the same CSS custom property are retained with source and context metadata
- [x] Context metadata covers selector, media, supports, scope and cascade layer when present
- [x] Duplicate definitions are deterministic and never silently reduced to last-entry-wins
- [x] Existing `:root`-only CSS token projects continue to populate the catalog
- [x] HMR refreshes the contextual catalog after an authored CSS declaration changes
- [x] Unit tests cover duplicate token names, themes, media queries, scopes and layers
- [x] Sandbox e2e coverage demonstrates one token with different light/dark declarations
- [x] Production virtual module exports an empty catalog and the production bundle contains no token metadata
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

None — can start immediately.
