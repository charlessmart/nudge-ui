# ADR-0010: Next.js host Adapter

Date: 2026-08-22
Status: Accepted

This ADR supersedes two deferred-scope statements: PLAN.md key constraint #6
("Webpack, CRA, Next.js, and Turbopack application integrations remain out of
scope") and ADR-0009's Consequences ("Webpack, Rollup, esbuild, Next.js, and
other build-tool integrations remain deferred"). The supersession covers the
Next.js element only: Webpack, CRA, Rollup, esbuild, and other build-tool
integrations remain out of scope or deferred exactly as those documents record.
Both documents are immutable; the supersession is recorded here rather than by
editing them.

## Context

Design Tool reaches a browser document through two hosts: the Vite Adapter and
the standalone static HTML Adapter. Both populate one runtime configuration
Interface consumed by a single inspector runtime.

Next.js applications cannot use either host. Turbopack is the default compiler
on modern Next.js versions and does not support webpack plugins or virtual
modules; it accepts a subset of webpack loaders through `turbopack.rules`.
React Server Components compile under the `react-server` condition: any module
graph edge introduced into a server-component file executes on the server,
where React hooks and fiber walking cannot run.

## Decision

Add a Next.js host Adapter as a third host alongside Vite and standalone,
behind the existing `DesignToolRuntimeConfig` seam. No second inspector is
created.

- The integration surface is loaders plus configuration. The single user
  touchpoint is a `withDesignTool(nextConfig)` wrapper. There are no virtual
  modules and no webpack plugins: Turbopack supports neither, only a loader
  subset via `turbopack.rules`. Webpack mode registers the same loader through
  ordinary module rules.
- Server-component files receive identity attributes only (`data-cid`,
  `data-src`, `data-cprops`). Semantic component-prop projection fails closed
  to client components — modules carrying a `"use client"` directive or Pages
  Router files. Ambiguous shared modules also fail closed. The limitation is
  surfaced in the UI, not hidden behind CSS guesses.
- Root-layout instrumentation supplies the dev-only inspector bootstrap. The
  loader appends a mount element to `<html>`-rendering root layouts in memory.
  Source files are never rewritten on disk.
- Token and component knowledge travels over a loopback manifest transport,
  proxied same-origin through rewrites, mirroring the standalone manifest
  pattern. Virtual modules do not exist outside Vite.

The supported range is Next.js >= 15.3 (stable `turbopack` config key) through
16.x; webpack mode is a secondary compatibility target. Turbopack is the
primary tested path; 15.x requires the `--turbopack` flag because Turbopack
becomes the development default only in 16.

ADR-0002 (dev-only gating), ADR-0003 (managed stylesheet), ADR-0005
(contextual selectors), ADR-0006 (Canvas controller/renderer), ADR-0007
(semantic component prop projections), and ADR-0008 (inline text projections)
remain fully authoritative. The Next.js Adapter inherits their contracts
unchanged. ADR-0004's single-React-instance goal is met through Next's own
module resolution rather than Vite aliasing.

## Consequences

- Server-component callsites are an honest capability reduction: identified in
  the UI but not prop-editable.
- Production builds remain untouched because instrumentation is phase-gated to
  dev-mode compilation (ADR-0002), with dev gating supplied by a host-provided
  flag where `import.meta.env.DEV` does not exist.
- Canvas enablement is deferred to its own verification step against
  route-level streaming and workspace-lease behavior across navigations.
- The wrapper gates on the supported version range and emits a diagnostic when
  an unsupported version is detected.

## Verification

- Production strip assertions: `next build` output contains no `data-cid`,
  `data-src`, or `data-cprops` attributes, no bootstrap import, and no mount
  element.
- Hydration attribute preservation assertions: Playwright proves injected
  attributes survive hydration on React 18 and React 19 rather than assuming
  it.
- Cross-host runtime-config equivalence tests: one runtime-config fixture
  produces equivalent inspector behavior under the Vite, standalone, and Next
  transports.
