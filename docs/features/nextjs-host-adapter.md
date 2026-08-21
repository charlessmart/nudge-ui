# Next.js host Adapter

**Status:** Draft implementation plan

**Sequence:** Scope decision → host-neutral groundwork → identity loader Module → tracer bullet → token lifecycle → semantic props → webpack parity → hardening

**Scope:** Next.js App Router and Pages Router applications in development; Inspect mode first

## Summary

Add a Next.js host Adapter as a third way to reach the browser document,
alongside the Vite Adapter and the standalone static host Adapter. The user
adds one line to `next.config.ts`:

```ts
import { withDesignTool } from "@design-tool/nextjs";
export default withDesignTool(nextConfig);
```

Everything else flows from that wrapper: source-identity injection, the
inspector bootstrap, token knowledge transport, and development-server
lifecycle integration. Selection, browser CSS inspection, value semantics,
managed stylesheet projection, change history, persistence, and prompt
generation remain shared Modules. This feature adds no second inspector.

Next.js is not Vite. Two facts drive every decision below:

1. **Turbopack is the default compiler (Next ≥ 16) and does not support
   webpack plugins or virtual modules.** It does support a subset of webpack
   *loaders* through `turbopack.rules`, including path/content conditions that
   can exclude `node_modules`. Webpack mode still exists but must be treated
   as a secondary target. The integration surface is therefore **loaders plus
   configuration**, never plugins plus virtual modules.
2. **React Server Components compile under the `react-server` condition.**
   Any module graph edge introduced into a server-component file executes on
   the server. The semantic component runtime (React hooks, fiber walking)
   cannot run there. Server-component files receive identity attributes only;
   semantic prop projection fails closed to client components. This is the
   honest capability reduction; it is not hidden by guessing at CSS.

## Relationship to existing decisions

This plan conflicts with two recorded scope statements and therefore requires
a new ADR before implementation (Stage 0):

- PLAN.md constraint #6: "Webpack, CRA, Next.js, and Turbopack application
  integrations remain out of scope."
- ADR-0009 Consequences: "Webpack, Rollup, esbuild, Next.js, and other
  build-tool integrations remain deferred."

Neither conflict changes an accepted mechanism decision. ADR-0010 would
extend the host Adapter pattern to Next.js while leaving ADR-0002 (dev-only
gating), ADR-0003 (managed stylesheet), ADR-0005 (contextual selectors),
ADR-0006 (Canvas controller/renderer), ADR-0007 (semantic prop projections),
and ADR-0008 (inline text projections) fully authoritative.

## User workflow

1. The user runs their Next.js app normally: `next dev`.
2. Design Tool instruments dev-mode compilation in memory; source files are
   never rewritten.
3. Every rendered element carries `data-cid`, `data-src`, and `data-cprops`.
4. The inspector mounts into a Shadow DOM beside the application.
5. The user previews CSS, token, rendered-text, and — inside client
   components — semantic component-prop changes.
6. The user copies a prompt that names project-relative source locations with
   a grep-ready selector fallback.
7. The coding agent edits source files; Next.js fast refresh / reload shows
   the result; refreshed token knowledge arrives over the manifest transport.

## Architectural outcome

```text
Vite Adapter ────────────┐
Standalone host Adapter ─┼─ runtime host configuration ─ inspector runtime
Next.js host Adapter ────┘

Next.js host Adapter (@design-tool/nextjs)
  ├─ withDesignTool(nextConfig) wrapper          ← the only user touchpoint
  ├─ identity loader Module (webpack + Turbopack rules)
  ├─ root-layout bootstrap instrumentation
  ├─ loopback manifest/reload sidecar server
  ├─ token-inventory artifact discovery + file watching
  └─ phase gating (dev-only; production untouched)
```

The browser inspector consumes the existing `DesignToolRuntimeConfig`
interface. The Next.js Adapter populates it from its manifest transport, the
Vite Adapter from its virtual modules, the standalone Adapter from its
manifest. Host lifecycle and transport must not leak into browser CSS
inspection, change history, managed projections, or prompt construction.

### Why loaders, not plugins

| Mechanism | Webpack mode | Turbopack mode |
| --- | --- | --- |
| Identity transform | custom loader rule | `turbopack.rules` loader entry |
| Inspector bootstrap | root-layout instrumentation (same loader pipeline) | same |
| Token knowledge | sidecar manifest via rewrites proxy | same |
| Virtual modules | not used | impossible |
| Webpack plugins | not used | unsupported |

Both compilers accept the same loader function. The loader wraps the existing
pure AST Module (`injectIdentity`), which already uses only `@babel/parser`
and `magic-string`. Determinism matters twice over here: Turbopack compiles
each module once per environment (react-server and client conditions), so the
loader runs up to twice per file and must produce identical output for
identical input.

### Bootstrap strategy

The App Router has no HTML file to rewrite. Options considered:

- **Middleware response rewriting** — rejected: requires a second user file
  (`middleware.ts`) and merges awkwardly when one exists.
- **Custom server wrapping `next()`** — rejected: replaces `next dev`,
  breaking the standard workflow.
- **Root-layout instrumentation (chosen):** the identity loader additionally
  matches root layout modules (`app/**/layout.{tsx,jsx}` whose source renders
  `<html>`) and appends a dev-only `<DesignToolMount />` element as the last
  child of the rendered tree. The marker keeps the pass idempotent.

`DesignToolMount` is a `"use client"` component that returns `null` on the
server and, in an effect: creates the `#design-tool-root` mount div, fetches
the runtime manifest, calls `configureDesignToolRuntime`, and calls
`bootstrapDesignTool`. Because the bootstrap module is compiled by Next's own
compiler, it resolves the host's React instance naturally — no aliasing step
(ADR-0004's goal achieved through module resolution instead).

### Knowledge transport

A loopback-only HTTP sidecar (spawned once per dev-server process, guarded
against double-spawn) serves:

- `/__design_tool__/manifest` — the frozen runtime snapshot: tokens,
  contracts, diagnostics, generation, capabilities; and
- `/__design_tool__/reload` — SSE revision notifications after settled file
  changes.

Same-origin access without CORS comes from a `beforeFiles` rewrite proxying
`/__design_tool__/*` to the sidecar port — both are wrapper-owned config, so
the touchpoint count stays at one. This mirrors the standalone manifest
transport deliberately; the client fetch/validation code shape should be
extracted and shared where practical.

Token artifacts are discovered by a bounded Node-side scan of the project
root and fed to `@design-tool/css/token-inventory` (authored stage), watched
with debounced rebuilds exactly like the standalone server. Reduced fidelity
versus Vite is documented, not hidden: no transformed-stage observations and
no active-import-graph ordering exist outside Vite. Browser CSSOM attribution
remains the runtime authority regardless.

## Identity policy

For every instrumented JavaScript/TypeScript module in the application
source:

- Host elements receive `data-cid`, `data-src`, and `data-cprops` exactly as
  the Vite Adapter injects them (same Module, same semantics, 1-indexed
  columns).
- `node_modules`, `.next`, and generated directories are excluded before
  parsing.
- Source files are never modified; instrumentation exists in memory only.

Client-component detection gates the semantic wrapper:

| File situation | Identity attrs | Callsite wrapper |
| --- | --- | --- |
| Contains `"use client"` | yes | yes |
| Under `pages/` (Pages Router) | yes | yes |
| In an app-dir project without `"use client"` | yes | **no** (may be a server component) |
| Shared module, ambiguous routing context | yes | no (fail closed) |

Wrapping a module that later joins the react-server graph would break the
build or render; failing closed loses some client-side instrumentation in
ambiguous shared modules but never lies about editability. A future stage may
shrink the ambiguity by consulting the import graph; that is explicitly out
of scope for v1.

Server-rendered elements keep their attributes through hydration because
React preserves unknown attributes present in server HTML; this assumption
gets an explicit Playwright assertion (see Verification).

## Capability contract

Next.js supports from the first tracer bullet:

- selection, hierarchy stepping, overlays, measurements;
- browser CSS attribution, raw-value controls, and confidence labels;
- CSS custom-property token inventory with provenance;
- managed stylesheet previews, undo, redo, revert, durable session;
- conservative rendered-text editing where durable identity is unique; and
- React-aware prompt output naming `file:line`, component, and selectors.

Next.js adds behind explicit capability flags after verification:

- semantic component-prop controls for invocations inside client components
  (existing `ComponentRuntimeAdapter`; no new runtime mechanism);
- Canvas mode, once renderer-role frames are verified against route-level
  streaming and the workspace lease across Next navigations.

Next.js does not support in v1:

- semantic prop overrides for server-component invocation sites (recorded as
  such in the UI rather than silently absent);
- source write-back;
- production instrumentation of any kind; and
- middleware/edge runtime internals as inspection targets.

## Delivery stages

Each stage is independently committed and leaves existing Vite and standalone
consumers releasable.

### Stage 0 — Scope decision

Write ADR-0010 (Next.js host Adapter) superseding the deferred-scope
statements above; update the PLAN.md scope table row for build-tool support;
accept this plan or its revisions.

**Exit conditions:**

- ADR-0010 merged; scope statements updated rather than contradicted.
- Supported Next.js range pinned (see Risks) and stated in the ADR.

### Stage 1 — Host-neutral groundwork

Small, separately verifiable inspector changes that unblock any third host:

- extend `DesignToolRuntimeHost` with `"nextjs-react"` (validation list,
  storage namespacing, tests);
- remove the hard dependency on `import.meta.env.DEV` in shared Modules: a
  bare property read on `undefined` throws in non-Vite bundles. Introduce a
  dev-flag seam (host-provided define or an optional-chained fallback) and
  keep Vite behavior byte-identical;
- publish subpath exports for the bundler-agnostic build-time Modules the
  Next package must reuse (`injectIdentity`, `extractComponentContracts`),
  or extract them if importing across packages drags Vite types along;
- add `transpilePackages` guidance so raw-TS workspace sources compile under
  Next/SWC.

**Exit conditions:**

- Existing Vite unit, e2e, and production-stripping coverage stays green.
- The standalone client builds unchanged.
- New unit tests cover the host enum and the dev-flag seam without Vite.

### Stage 2 — Identity loader Module

Create `packages/nextjs` with the loader entry: a pure function from
`(source, moduleId, options)` to `(code, map)`, wrapping the Stage 1 exports.
New behavior lives behind its options, not in the shared Module:

- client-component detection (directive scan; Pages Router rule);
- conditional prepend of the `instrumentReactComponent` import for client
  modules only;
- root-layout matching and `<DesignToolMount />` insertion with idempotence
  markers;
- exclusion prefilter (extensions, `node_modules`, `.next`) before any parse.

**Exit conditions:**

- Unit tests cover TSX/JSX/TS/JS, directives, type-argument JSX, fragments,
  sibling adjacency, layouts with/without `<html>`, double-run idempotence,
  and byte-preservation when nothing matches.
- The Module has no Next, webpack, Turbopack, filesystem, or browser
  dependency.

### Stage 3 — Tracer bullet

Wire `withDesignTool`: phase-gated loader registration (Turbopack rules with
`{ not: 'foreign' }` conditions; webpack module rules), the sidecar server,
the rewrites proxy, and the `DesignToolMount` client component fetching the
manifest and bootstrapping the shared inspector with
`capabilities: { canvas: false, componentSemantics: false }`.

Add `examples/sandbox-next` (App Router, a few components, plain CSS vars +
one Tailwind-ready stylesheet) with a Playwright harness mirroring the
existing sandboxes.

**Exit conditions:**

- `next dev` with the wrapper mounts the inspector; an element can be
  selected with correct `data-cid`/`data-src` identity.
- A raw CSS preview applies through the managed stylesheet and survives a
  client-side navigation.
- Prompt copy includes exact source location and selector fallback.
- Hydration preserves injected attributes (asserted, not assumed).
- Source files remain byte-for-byte unchanged on disk.

### Stage 4 — Token lifecycle

Feed scanned stylesheets into the token inventory, publish the snapshot
through the manifest with deterministic generation, and watch files with
debounced rebuilds and SSE revision bumps (reusing the standalone watcher
pattern; extract shared code if duplication bites).

**Exit conditions:**

- CSS custom-property tokens appear with project-relative provenance.
- Editing CSS updates the generation exactly once per settled batch and
  triggers at most one reload notification; the client deduplicates against
  Next's own refresh.
- Add/change/remove transitions have unit tests; unreadable CSS produces
  diagnostics without disabling inspection.

### Stage 5 — Semantic component props (client components)

Enable `componentSemantics`: component-contract scanning feeds the manifest;
callsites in client modules wrap through the existing React runtime Adapter;
overrides rerender real components; server-component invocations surface as
identified-but-not-prop-editable.

**Exit conditions:**

- A sandbox fixture flips typed enum/boolean props on a client component and
  observes a true rerender; no managed stylesheet declaration results.
- Undo, revert, durable serialization, and prompt output retain callsite
  identity.
- A server-component callsite never produces an override control.
- Fast Refresh and Strict Mode double-mounts do not corrupt multiplicity
  accounting (existing registry semantics hold).

### Stage 6 — Webpack-mode parity

Register the same loader through the `webpack` callback for projects running
`next dev --webpack` or older Next versions, sharing the Stage 2 Module
unchanged. Turbopack remains the primary tested path.

**Exit conditions:**

- The sandbox passes its core spec under webpack mode.
- Config merging does not clobber user webpack customization.

### Stage 7 — Hardening and release

Production stripping proof (`next build` contains no identity attributes, no
bootstrap import, no mount — asserted by grep-style e2e against the built
output, mirroring the sandbox `prod` project); Fast Refresh behavior matrix
(edit component / edit CSS / edit layout); React 19 fiber-walk verification;
prompt framework header reads `Next.js (App Router) + React`; projectId
namespacing `nextjs:<digest>`; cold-start measurement against the concerns in
issue 0048; decide Canvas enablement as its own follow-up issue.

**Exit conditions:**

- Production bundle assertions pass; dev-only contract held (ADR-0002).
- `pnpm lint`, `pnpm typecheck`, all unit suites, and existing sandboxes'
  e2e remain green.
- Repository verification obligations met for the new example.

## Verification strategy

**Module tests (Vitest):** loader transforms and exclusions; client/server
policy table; layout instrumentation idempotence; manifest validation;
sidecar routes, confinement, and revision coalescing; wrapper output shapes
for both compilers; production no-op.

**Consumer tests (Playwright, `examples/sandbox-next`):** selection and
identity; CSS/token preview through the managed sheet; inline text; semantic
prop override on a client component; navigation persistence; agent-style
edit → refresh; hydration attribute preservation; production-strip project.

**Cross-host equivalence tests:** the same runtime-config fixture produces
equivalent inspector behavior under Vite and Next transports, proving the
seam rather than either host.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Turbopack implements only a loader-API subset | The loader uses `this.callback(code, map)` and nothing exotic; pin supported range; CI runs the real compilers rather than mocking them. |
| Compiler or config churn across Next majors | Version-range gate in the wrapper with a clear diagnostic; conformance harness runs against the oldest and newest supported versions. |
| Loader runs twice per file (react-server + client conditions) | Pure deterministic transform; identical output both passes; tests assert determinism. |
| `"use client"` heuristic misclassifies shared modules | Fail closed (attrs only); document; revisit with import-graph analysis later. |
| Hydration drops or warns about injected attributes | Explicit Playwright assertion on React 18 and 19; escape hatch: disable instrumentation per-glob in options. |
| Babel parse cost on every JS file | Extension/path prefilter before parse (same as Vite); measure cold start; consider SWC-based rewrite only if measured as a problem. |
| Sidecar double-spawn (config evaluated repeatedly) | Singleton guard keyed by pid/port file; stale-port recovery. |
| Rewrites collide with user rewrites | Merge, don't replace; reserve the `/__design_tool__` namespace and detect collisions with a diagnostic. |
| Root layout variants (route groups, multiple roots) | Instrument every `<html>`-rendering layout; idempotence marker prevents duplicates; e2e covers a route-group fixture. |
| Persistent caches serve stale instrumented output | Dev-phase gating means prod is untouched; document clearing `.next` when upgrading the Adapter; verify after upgrades. |
| Workspace TS sources fail to compile under Next | `transpilePackages` set by the wrapper; covered in Stage 3 smoke. |

## Deferred work

- Vue/Svelte/Angular runtime Adapters (different frameworks, same seams).
- Turbopack-native (Rust) plugin or persistent-cache awareness.
- Import-graph-aware client/server classification.
- Canvas enablement for Next (own issue after Stage 7 verification).
- MCP live bridge (unchanged, v2).
- Write-back-to-source (unchanged, v2+).

## Where this plugs into the repository

- Host enum and capabilities: `packages/inspector/src/runtimeConfig.ts`
- Runtime Adapter registry (unchanged consumer):
  `packages/inspector/src/componentSemantics/adapterRegistry.ts`
- Reused build-time Modules: `packages/plugin/src/transform/injectDataCid.ts`,
  `packages/plugin/src/components/extractContracts.ts`,
  `packages/css/src/token-inventory/`
- Transport pattern being mirrored:
  `packages/standalone/src/{server,manifest,watcher}.ts`, `src/client.tsx`
- Consumer harness precedent: `examples/sandbox`, `examples/standalone-html`

## Appendix: transpilePackages guidance

Every Design Tool workspace package ships raw TypeScript: each package's
`exports` map points directly at `src/*.ts(x)` sources with no build step.
Vite compiles consumed workspace sources automatically, but Next.js compiles
only the importing project's own code — anything resolved from `node_modules`
(which includes pnpm workspace links) is treated as pre-built JavaScript and
handed to SWC untranspiled. Without opt-in, a Next app importing
`@design-tool/inspector` fails on JSX and TypeScript syntax.

Consumers — or the `withDesignTool` wrapper on their behalf (Stage 3) — must
list every Design Tool package reachable from browser code:

```ts
transpilePackages: [
  "@design-tool/inspector", // the bootstrap + shared inspector runtime
  "@design-tool/css",       // model/value-semantics modules pulled in by the inspector
  "@design-tool/plugin",    // only if client code imports its runtime subpaths
]
```

Notes:

- The loader-side Modules (`@design-tool/plugin/identity`,
  `@design-tool/plugin/component-contracts`) execute inside the Node build
  pipeline, never in the browser bundle, so they do not force transpilation by
  themselves; the wrapper includes the plugin package anyway so the
  `vanilla-extract-runtime` adapter stays usable.
- `transpilePackages` is additive config: merging it must not clobber entries
  the host application already declared.
- This is reduced fidelity by design (see Knowledge transport): the inspector
  sources are compiled by SWC rather than Vite, which changes nothing about
  the managed-stylesheet or identity contracts, but any future use of
  Vite-specific transforms inside workspace sources would break under Next and
  is therefore prohibited by this guidance.

