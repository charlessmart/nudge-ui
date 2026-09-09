# AGENTS.md

Guidance for AI coding agents working on this repository.

## Project overview

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

## Tech stack

- Language: TypeScript with strict checking and ES modules.
- Workspace runtime: Node.js 22.12 or newer. Published packages target Node.js
  20 or newer unless their package metadata states otherwise.
- Package manager: pnpm 10 workspaces (`packages/*`, `landing/`, and `examples/*`).
- Build tools: Vite for the primary plugin and React fixtures; host adapters
  for Next.js, Astro, and static HTML.
- UI runtime: React 18 and React 19 consumer fixtures.
- Unit tests: Vitest.
- Browser tests: Playwright against the landing app and consumer applications.
- Static checks: ESLint, Oxlint, and the repository's custom anti-slop rules.

The shared compiler settings live in `tsconfig.base.json`. They include strict
typing, `noUncheckedIndexedAccess`, bundler module resolution, declaration
output, and source maps.

## Repository layout

### Runtime packages

- `packages/agent-protocol` — host-neutral browser bridge and Canvas command
  contracts.
- `packages/astro` — Astro integration, response instrumentation, and runtime
  bootstrap.
- `packages/compatibility` — cross-browser compatibility manifests and
  Playwright helpers used by the styling-system fixtures.
- `packages/create-nudge-ui` — framework detection, adapter installation, and
  host-configuration setup.
- `packages/css` — browser-safe CSS and token models, value semantics, and
  build-time token inventory.
- `packages/inspector` — selection, CSS inspection, managed previews, changes,
  prompts, Canvas, and the React runtime.
- `packages/mcp` — the optional MCP stdio server and authenticated local
  browser companion.
- `packages/nextjs` — Next.js loaders, wrapper, manifest transport, and
  runtime mount.
- `packages/package-css-fixture` — CSS package fixture used by consumer tests.
- `packages/plugin` — Vite transforms, virtual modules, token discovery, and
  development HTML bootstrap.
- `packages/standalone` — static HTML instrumentation, server, CLI, and
  browser client.

### Public application

- `landing` — the explicit public landing-demo artifact.

### Consumer applications

- `examples/sandbox` — the primary Vite and React consumer fixture.
- `examples/sandbox-tailwind-v3` and `examples/sandbox-tailwind-v4` —
  Tailwind consumer fixtures.
- `examples/sandbox-sprinkles` — the vanilla-extract and Sprinkles fixture.
- `examples/sandbox-next` — the Next.js App Router fixture.
- `examples/sandbox-astro` — the Astro fixture, including React islands.
- `examples/standalone-html` — the static HTML consumer fixture.

### Documentation and tooling

- `docs/adr/` — numbered, immutable architecture decision records.
- `docs/agents/` — domain, issue-tracker, triage, and type-safety guidance for
  coding agents.
- `docs/architecture/` — current architecture explanations.
- `docs/browser-storage.md` — browser persistence keys, stored data, lifetime,
  sensitivity, and clearing instructions.
- `docs/qa/tools/` — the cross-host browser-QA battery. It writes JSON issue
  reports to `docs/qa/` and generates local screenshots under the ignored
  `docs/qa/screenshots/` directory.
- `tools/anti-slop/` — the custom Oxlint plugin and its tests.

## Commands and verification

Run commands from the repository root unless a command uses `--filter`:

```sh
pnpm install
pnpm test:unit
pnpm test:e2e
pnpm test:e2e:standalone
pnpm test:compat
pnpm typecheck
pnpm lint
pnpm lint:oxlint
pnpm build
pnpm build:packages
pnpm package:verify
```

`pnpm test:e2e` runs the Vite, Tailwind, Sprinkles, standalone HTML, Next.js,
and Astro consumer suites. Use `pnpm test:anti-slop` for the custom lint-rule
tests. Use `pnpm perf` or `pnpm perf:baseline` for the sandbox performance
suites. The development sandbox can be started with `pnpm dev:sandbox`; the
landing demo uses `pnpm dev:landing`.

Package-level checks use the scripts declared in each package, for example:
`pnpm --filter @nudge-ui/inspector test:unit` and
`pnpm --filter @nudge-ui/nextjs typecheck`.

Keep generated output out of changes. Build output (`dist/`, `build/`, and
`.next/`), Playwright output (`test-results/`), coverage, dependency folders,
and local tool configuration are ignored by the repository.

## Repository conventions

- Keep package implementation and unit tests together under each package's
  `src/` directory. Consumer-specific Playwright tests belong under the
  corresponding example's `tests/` directory.
- Preserve the workspace package boundaries. Shared browser contracts belong
  in the neutral packages; framework-specific behavior belongs in its host
  adapter.
- Use `data-*` attributes for rendered identity and preserve that identity
  across framework re-renders.
- Treat browser CSSOM and computed styles as the source of truth for rendered
  styling. Keep previews in the managed stylesheet and semantic previews in
  framework adapters.
- Source mapping is best effort. When authored source is unavailable, prompts
  must state that limitation and include bounded rendered evidence.
- Keep browser persistence changes aligned with `docs/browser-storage.md`.
  Document new key families, sensitive fields, retention, and clearing behavior.
- Preserve unrelated working-tree changes and do not rewrite history.

## Architectural hard rules

1. **Dev-only gating (ADR-0002):** every transform, injection, and runtime
   module is guarded by `import.meta.env.DEV`. The plugin's `transform` hook
   must no-op outside development, and the virtual `design-tokens` module must
   resolve to an empty table in production.
2. **Managed stylesheet and Adapter projections (ADR-0003, ADR-0007):** never
   write `style="..."` inline on a tracked element. CSS and token edits become
   managed rules keyed by stable identity. Component prop changes rerender
   through the framework Adapter and never mutate rendered host attributes as
   a preview mechanism.
3. **Stable identity:** do not rely on DOM selectors that drift across
   re-renders or on fiber references that change across renders.
4. **Best-effort source mapping:** do not expose injected runtime selectors as
   source guidance. If an authored source location is unavailable, prompts
   must say so and include bounded evidence such as text, accessible name,
   props, and element type.

## ADRs

ADRs in `docs/adr/` are immutable once merged. To change a decision, write a
new ADR that supersedes it and update `docs/adr/README.md`. Never edit an
existing ADR.
