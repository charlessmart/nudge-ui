# AGENTS.md

Guidance for AI coding agents working on this repository.

## Project overview

Design Tool is a dev-only Vite plugin + runtime inspector for visually editing
UI live in the browser and copying structured prompts for an AI coding agent.

Read `PLAN.md` for the full scope and architecture. It is the source of truth.
The active build order lives in `docs/issues/` (Milestones 1-3 are in scope now,
4-7 are deferred).

## Tech stack

- Language: TypeScript (ESM, strict).
- Monorepo: pnpm workspaces (see `pnpm-workspace.yaml`).
- Build tool: Vite 5.
- Test runner: Vitest for unit tests.
- E2E test runner: Playwright — drives the sandbox app in `examples/sandbox`.
- React 18.

## Layout

- `packages/plugin` — Vite plugin (`@design-tool/plugin`).
- `packages/inspector` — runtime inspector UI.
- `examples/sandbox` — sandbox app + e2e harness.
- `docs/adr/` — architecture decision records (immutable once written).
- `docs/issues/` — issue tracker (local markdown, `needs-triage` label on each).

## Hard rules (do not violate, see relevant ADR)

1. **Dev-only gating (ADR-0002)**: every transform / injection / runtime
   module is guarded by `import.meta.env.DEV`. The plugin's `transform` hook
   must no-op outside dev. The virtual `design-tokens` module resolves to an
   empty table in production.
2. **Managed stylesheet only (ADR-0003)**: never write `style="..."` inline on
   a tracked element. All edits become rules in `<style id="design-tool-styles">`
   keyed by `[data-cid="..."][data-src*="..."]`.
3. **`data-*` attributes are the identity layer (PLAN.md constraint #3)**: do
   not rely on DOM selectors that drift across re-renders, or on fiber refs that
   change across renders.
4. **Source mapping is best-effort (PLAN.md constraint #4)**: when `__source` /
   `_debugSource` is absent, fall back to `data-cid` + grep-ready selector. The
   prompt generator must always include a selector fallback.
5. **Vite-only for v1 (PLAN.md constraint #6)**: do not introduce Webpack /
   SWC / Babel plugin logic. Cross-build-tool work is out of scope.
6. **React-first (PLAN.md scope)**: do not add Vue/Svelte adapters.

## Verification obligations

- Every implementation issue outcome must include:
  1. Unit tests for the non-UI logic (Vitest).
  2. An e2e test (Playwright) for end-user-facing behaviour, when applicable.
  3. A successful `pnpm --filter sandbox build` with the dev-only contract held
     (no `data-*` attrs in the production bundle — ADR-0002).
- Run `pnpm lint` and `pnpm typecheck` before reporting done.
- Never commit changes unless explicitly asked.

## Issue workflow

- Each issue lives at `docs/issues/NNNN-slug.md`.
- Issues are vertical (tracer-bullet) slices, not horizontal layer slices.
- Pick up the lowest-numbered issue whose `Blocked by` list is satisfied.
- Update the issue's acceptance criteria checkboxes by editing the file when
 Criteria are met.

## ADRs

ADRs in `docs/adr/` are immutable. To change a decision, write a new ADR that
supersedes it and update `docs/adr/README.md`. Never edit an existing ADR.