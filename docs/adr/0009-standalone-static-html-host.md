# ADR-0009: Standalone static HTML host Adapter

Date: 2026-08-21
Status: Accepted

## Context

Design Tool currently reaches a browser document through the Vite Adapter. The
Adapter injects source identity, publishes token and component knowledge through
virtual modules, inserts the inspector bootstrap, and owns development-server
lifecycle integration.

Users also create framework-free HTML/CSS prototypes with coding agents. These
projects may not contain a package manifest, build tool, or React dependency,
but they still need the core Design Tool loop: select rendered elements,
inspect browser CSS, preview changes, and copy source-oriented prompts.

The token inventory and browser CSS inspection Modules are already independent
of Vite. The remaining coupling is transport and lifecycle: the inspector reads
Vite virtual modules directly, JSX is the only automatic source-identity path,
and React is supplied by the host application.

## Decision

Add a standalone static HTML host Adapter alongside the Vite Adapter.

The standalone Adapter:

- owns a localhost-only development server for a user-selected prototype root;
- instruments served HTML responses with dev-only `data-cid` and `data-src`
  source identity without modifying source files;
- serves a self-contained inspector client that owns its React runtime;
- supplies runtime configuration and token knowledge through a host-neutral
  manifest instead of Vite virtual modules;
- feeds ordinary project CSS into the existing token inventory Module; and
- preserves prompt handoff as the source-change mechanism.

The browser inspector consumes one runtime configuration Interface regardless
of host. The Vite Adapter populates it from its existing virtual modules. The
standalone Adapter populates it from its manifest. Host lifecycle and transport
must not leak into browser CSS inspection, change history, managed projections,
or prompt construction.

Static HTML has no framework runtime Adapter. Component-prop controls are
therefore absent. CSS, token, and conservative rendered-text projections remain
available. Runtime-created elements may receive generated `data-*` identity and
selector-only prompt evidence, but the inspector must not invent source
locations.

ADR-0002 remains the production contract for Vite consumers. The standalone
server is itself a development-only entry point and never rewrites or emits a
production build. ADR-0003, ADR-0005, ADR-0007, and ADR-0008 continue to govern
preview behavior. ADR-0006 remains unchanged: Canvas is not part of standalone
HTML support.

## Consequences

- A prototype can run with `design-tool serve <directory>` without adding Vite,
  React, or Design Tool dependencies to the prototype.
- The inspector runtime gains an explicit host-configuration seam instead of
  importing host transport as global state.
- The standalone client is larger than the Vite client because it bundles its
  own React runtime. Those bytes are development-only.
- Source mapping is exact for instrumented static HTML and best-effort for
  runtime-created DOM.
- Webpack, Rollup, esbuild, Next.js, and other build-tool integrations remain
  deferred. They can use the same runtime configuration Interface later.

## Verification

- Runtime configuration tests prove equivalent Vite and standalone knowledge.
- HTML instrumentation tests prove source locations, exclusions, stable
  identity, and source preservation.
- A standalone Playwright consumer proves selection, CSS/token preview, prompt
  output, reload, and absence of injected attributes in source files.
- Existing Vite unit, end-to-end, and production-stripping coverage remains
  green.
