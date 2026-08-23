# AGENTS.md

Guidance for AI coding agents working on this repository.

## Project overview

Design Tool is a dev-only Vite plugin + runtime inspector for visually editing
UI live in the browser and copying structured prompts for an AI coding agent.


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
- `docs/issues/` — active issue tracker (local markdown, `needs-triage` label on
  each); completed issue history is kept in `docs/issues/archive/`.

## Hard rules (do not violate, see relevant ADR)

1. **Dev-only gating (ADR-0002)**: every transform / injection / runtime
   module is guarded by `import.meta.env.DEV`. The plugin's `transform` hook
   must no-op outside dev. The virtual `design-tokens` module resolves to an
   empty table in production.
2. **CSS managed stylesheet; semantic props use Adapters (ADR-0003,
   ADR-0007)**: never write `style="..."` inline on a tracked element. CSS and
   token edits become managed rules keyed by stable identity. Component prop
   changes rerender through the framework Adapter and never mutate rendered
   host attributes as a preview mechanism.
3. **`data-*` attributes are the identity layer (PLAN.md constraint #3)**: do
   not rely on DOM selectors that drift across re-renders, or on fiber refs that
   change across renders.
4. **Source mapping is best-effort**: when an authored source location is
   unavailable, prompts must say so and include bounded rendered evidence such
   as text, accessible name, props, and element type. Do not expose injected
   runtime selectors as source guidance.

## ADRs

ADRs in `docs/adr/` are immutable. To change a decision, write a new ADR that
supersedes it and update `docs/adr/README.md`. Never edit an existing ADR.
