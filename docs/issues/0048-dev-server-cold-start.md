# 0048 — Dev-server cold start

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a developer of a large Vite app, enabling Design Tool does not add
seconds to dev-server startup and first page load: module transforms stay
cheap and stylesheet processing is scoped to what the app actually loads.

## What to build

A vertical slice that reduces plugin-side overhead without changing
behavior:

1. Scope `ensurePostTransformCss` (`plugin/src/index.ts:211-228`) to
   stylesheets reachable from the served module graph instead of
   `scanCssFiles` over the whole repo; the virtual tokens module must not
   block first load on transforming every CSS file in the project.
2. Make the eager `buildStart` scans (`index.ts:251-272`) asynchronous or
   defer them until the virtual module is first requested; keep the
   token-catalog populating from the transform hook as primary.
3. Avoid double-parsing: `cacheComponentsForFile` runs a second Babel parse
   per TSX file (`components/extractContracts.ts:151-160`) on top of
   `injectIdentity`'s parse; share one parse per transform pass.
4. Drop `hires: true` source maps in the injection transform
   (`injectDataCid.ts:444`) — prefer standard maps with content — and skip
   the AST walk for files that cannot contain JSX before parsing where
   detectable.
5. Keep `handleHotUpdate` CSS invalidation from re-running the full
   Tailwind pipeline for the virtual tokens module when the changed
   stylesheet does not define tokens.

## Acceptance criteria

- [ ] First page load does not block on transforming every CSS file in the
      repo; only graph-reachable stylesheets are pre-transformed.
- [ ] Token catalog contents are unchanged for the sandbox and a
      representative large repo (no missing/extra tokens vs today).
- [ ] Each TSX module is parsed at most once per transform pass.
- [ ] Transform maps remain usable by Vite devtools without the hires cost.
- [ ] Unit tests cover graph-scoped pre-transform selection and parse
      reuse; a cold-start smoke test asserts startup transform time scales
      with the loaded graph, not repo size.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Runtime inspector performance (0042–0047).
- Replacing Babel with a lighter parser wholesale (transform correctness is
  the existing contract).

## Blocked by

None — can start immediately (independent of 0041; ordered last per the
program plan).
