# ADR-0001: Monorepo structure

Date: 2026-07-08
Status: Accepted

## Context

Design Tool is a Vite plugin + runtime inspector. They share types but ship
independently and have different runtime contexts (Node build-time vs. browser
runtime). We also need a realistic sandbox app to verify the plugin end-to-end
without depending on a private work codebase.

## Decision

pnpm workspaces with three top-level areas:

- `packages/plugin` — the Vite plugin (Node, ESM, TypeScript).
  - Houses AST transform, token-table parser, virtual module, and the inspector
    mount-point injection. Published as `@design-tool/plugin`.
- `packages/inspector` — the runtime inspector UI (browser, Shadow DOM React portal).
  Bundled into the host app at dev time via the plugin. Not published standalone in v1.
- `examples/sandbox` — a Vite + React + CSS-vars app. Used for unit/e2e verification
  across every milestone. Sits inside the workspace so it can `link` the plugin.

## Consequences

- Single `pnpm install` at the root; packages can import each other via workspace
  protocol (`workspace:*`) without publishing.
- The sandbox doubles as the e2e test harness (Playwright drives it).
- Any package can be extracted to its own repo later if the inspector grows beyond
  v1 scope.

## Verification

- `pnpm i` resolves workspace links.
- `pnpm --filter sandbox dev` runs the sandbox app with the plugin enabled.