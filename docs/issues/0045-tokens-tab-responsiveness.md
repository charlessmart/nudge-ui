# 0045 — Tokens tab responsiveness

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer in a large app, the Tokens tab stays responsive while the host
app updates (React commits, hover states, animations), and editing a token
value does not rebuild the whole catalog view.

## What to build

A vertical slice that removes host-mutation-driven rebuilds and quadratic
row work from the Tokens tab:

1. Narrow the panel's MutationObserver (`TokensPanel.tsx:22-48` observes
   `documentElement {attributes}` + head subtree) to only
   stylesheet-affecting records (style/link nodes, media-query changes);
   element attribute churn must not bump the panel revision.
2. Memoize the token catalog build (`getAvailableTokenCatalog`,
   `resolution.ts:243-281` — computed-style reads per token plus a
   stylesheet-node `querySelectorAll`) by stylesheet revision and cached
   stylesheet sources.
3. Eliminate the O(rows²) rebuild: each `TokenCatalogItem` maps the full
   rows array per edit (`TokensPanel.tsx:128-131`); derive per-item rows in
   one pass shared across items.
4. Memoize `TokenCatalogItem` rows and use `useDeferredValue` for the
   catalog search filtering (`TokenField.tsx:276-281` filters every entry
   per keystroke).

## Acceptance criteria

- [ ] Host attribute mutations (non-stylesheet) no longer rebuild the
      catalog panel while the Tokens tab is open.
- [ ] Catalog build is served from cache when no stylesheet-relevant change
      occurred; `getComputedStyle(document.documentElement)` and the
      stylesheet `querySelectorAll` run once per revision, not per mutation.
- [ ] Editing a token value does one rows build for all items, not one per
      item.
- [ ] Unit tests cover observer record filtering, catalog memoization keyed
      by stylesheet revision, and single-pass row derivation.
- [ ] Harness (0041): token value edit stays within the commit budget with
      a large token catalog while the host mutates.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Cascade resolution caching (0042) and reveal (0043).
- Managed-sheet writes and verification (0044).

## Blocked by

- 0041 — Large-app performance harness.
