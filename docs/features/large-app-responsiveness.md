# Large-app responsiveness

Program plan for eliminating selection-reveal and edit-commit lag when Design
Tool runs against a large host app (large DOM, thousands of CSSOM rules, many
stylesheets — e.g. a production-scale Vite/React/React Router codebase with
Tailwind).

## Problem

Observed against a large host app:

1. Clicking an element takes a long time before the inspector shows its styles.
2. Committing any edited value (blur/Enter/select/nudge) feels very slow.

Typing keystrokes are cheap (local React state, commit on blur); the lag lands
on selection and on every commit.

## Root-cause summary (measured by analysis, July 2026)

### Selection reveal

- Cold cascade re-resolution per selection: `resolvePropertiesFromRules`
  walks every stylesheet rule (10k–50k in a Tailwind app) and calls
  `el.matches` per rule per ancestor (`collectLocalAliases`,
  `resolveInheritedProperties`) — O(ancestors² × rules), with specificity
  regexes recomputed per rule per ancestor.
- The resolution snapshot cache is structurally cold:
  - keyed on a `TokenTable` rebuilt per selection (fresh object identity),
  - invalidated by a document-wide MutationObserver on any DOM mutation
    (React apps mutate constantly),
  - self-invalidated by the tool's own probes (verification probes,
    container-query probes, `normalizeInElementContext`) mid-resolve.
- Full-document scans run synchronously in the click task:
  `countSourceSiteMatches` (`querySelectorAll`), O(tokens)
  `getPropertyValue` probes, a second full resolve via
  `getStableTokenProperty`, O(5 × rules) interaction-state scan.
- Whole-panel React re-render on every selection (no memoization anywhere;
  selection identity churns on every edit refresh).

### Edit commit

- Every commit re-verifies every accumulated change: `querySelectorAll` over
  the whole DOM per change plus probe insert/measure/remove per match —
  O(changes × DOM) + forced style recalcs, growing with session length.
- Whole managed stylesheet re-serialization via `el.textContent` on every
  commit (full reparse + document-wide selector re-match).
- Full CSSOM re-collection after every commit (invalidation + self-inflicted
  by the managed-sheet guard re-appending the style element).
- Synchronous full-session `JSON.stringify` + `localStorage.setItem` per
  commit.
- Tokens tab rebuilds the whole catalog on every document attribute mutation
  while mounted; O(rows²) `effectiveRows` rebuild per edit.

### Other

- Canvas mode: two full `querySelectorAll("[data-cid]")` scans per hover
  (renderer + controller), unthrottled hover postMessages, full-frame scans
  per click.
- Dev-server cold start: eager full-repo scans + double Babel parse per TSX +
  transform-all-CSS blocking the first load.

## Metric targets

Measured by the harness (issue 0041) against the synthetic large fixture:

| Metric | Baseline (today) | Target |
| --- | --- | --- |
| Selection reveal (click → styles visible) | 1081 ms (median of 3, 2026-08-01) | < 100 ms |
| Edit commit (blur/Enter → host update + panel refresh) | 410 ms (median of 3, 2026-08-01) | < 50 ms |
| Repeat-select of the same element | 795 ms (median of 3, 2026-08-01 — cache is structurally cold) | warm cache, < 30 ms |
| Commit cost growth with session length | 8.71× (commit #20 vs #1, median of 3) | sublinear |

## Slices

| # | Slice | Blocked by |
| --- | --- | --- |
| 0041 | Large-app performance harness (fixture + Playwright budgets) | — |
| 0042 | Resolution cache integrity (kill self-invalidation) | 0041 |
| 0043 | Selection reveal latency (single-pass cascade + source-site cache) | 0041, 0042 |
| 0044 | Edit commit latency (delta verification + incremental sheet + debounced autosave) | 0041, 0042 |
| 0045 | Tokens tab responsiveness | 0041 |
| 0046 | Panel render architecture (memoization + transitions) | 0041 |
| 0047 | Canvas interaction latency | 0041 |
| 0048 | Dev-server cold start | — |

Execution order (lowest-numbered first, per repo convention): 0041 → 0042 →
0043 → 0044 → 0045 → 0046 → 0047 → 0048.

## Constraints

- Dev-only gating (ADR-0002) must hold: no perf change may alter production
  bundles; every `pnpm --filter sandbox build` must remain free of `data-*`
  attributes and inspector bootstrap.
- ADR-0003 managed-stylesheet contract: edits remain managed CSS rules keyed
  by stable identity; incremental writes must preserve cascade-last ordering
  and the guard that keeps the sheet last in `<head>`.
- Every slice ships unit tests for non-UI logic and an e2e latency assertion
  where applicable, and passes `pnpm lint`, `pnpm typecheck`.
