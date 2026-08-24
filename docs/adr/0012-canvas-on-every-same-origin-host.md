# ADR-0012: Canvas on every same-origin host Adapter

Date: 2026-08-24
Status: Accepted

This ADR supersedes two scope statements. It supersedes ADR-0009's
Consequences line "ADR-0006 remains unchanged: Canvas is not part of
standalone", and it supersedes ADR-0006's decision item 6 ("Single-origin,
Vite-only: only same-origin Vite dev-server routes are supported"). Both
superseded documents are immutable; the supersession is recorded here rather
than by editing them.

## Context

ADR-0006 defined the live Canvas as a controller/renderer split over
same-origin Vite dev-server iframes, and the standalone static HTML host was
later scoped out of Canvas (ADR-0009). The Next.js host adapter (ADR-0010)
deferred canvas enablement to its own verification step.

The canvas runtime in `packages/inspector/src/canvas/` turned out to be
host-agnostic: role detection reads `window.frameElement`, projection travels
over a versioned `postMessage` protocol, and persistence/leases are
same-origin localStorage keyed by the runtime project id. No host-specific
mechanism participates in any of those paths — a host only needs to (a)
publish `capabilities.canvas` in its runtime configuration and (b) ensure its
bootstrap runs in every document it serves, including documents loaded inside
card iframes.

Enabling Canvas on Next.js surfaced exactly one host-coupled defect: the
frame handshake assumed the renderer's runtime boots before the iframe load
event delivers `parent-ready`. Hosts whose renderer runtime boots
asynchronously after load (dynamic inspector import plus manifest fetch under
Turbopack) missed the single announcement and never acquired an identity.
The protocol now lets the renderer solicit the handshake (`renderer-hello`,
protocol v11), which removes the boot-order assumption for every host.

## Decision

Canvas is enabled for every host adapter that serves its bootstrap into all
same-origin dev documents: the Vite React plugin (`canvas: true`, existing),
the Next.js adapter, and the standalone static HTML host. The Astro adapter
keeps `canvas: false` until its response-level identity pipeline is verified
inside card iframes; this is a capability flag, not an architecture limit.

- **Capability flag is the only gate.** Hosts enable Canvas by publishing
  `capabilities.canvas: true`; no canvas code path may special-case a host
  name.
- **Renderer boot order is irrelevant.** A renderer solicits the handshake
  when its listeners are live (`renderer-hello`); the controller answers with
  the identity announcement. Controllers keep answering on iframe load for
  renderers that boot before load.
- **Standalone multi-page previews** use sibling pages served by the same
  loopback server; cards are ordinary same-origin navigations. Runtime-inserted
  element identity continues to apply inside renderers.
- **Dev-only gating is unchanged** (ADR-0002): the standalone client bundle
  statically defines `import.meta.env.DEV`, so production artifacts contain
  no Canvas UI or frame protocol regardless of the flag.

## Consequences

- The QA report finding "canvas mode is only enabled on the React host" is
  resolved for the Vite, Next.js, and standalone hosts; Astro remains
  explicitly off.
- The standalone browser manifest validation now accepts only the capability
  set the standalone host publishes, keeping its fail-closed contract.
- Component knowledge on the Next host must survive dev-server restarts
  independently of compiler caches; the sidecar aggregates contracts from
  authored sources at startup and on settled watcher batches.
- Cross-origin cards, multiple cooperating dev servers, and microfrontend
  composition remain deferred exactly as ADR-0006 recorded.

## Verification

- `examples/sandbox-next/tests/canvas.dev.spec.ts`: board mount, projection
  into renderer cards under Turbopack, link-discovered route cards,
  page-view handoff with durable session, layout durability across reload,
  single-writer ownership across tabs.
- Standalone Playwright consumer covers the same flows against the loopback
  static server with plain multi-page HTML prototypes.
- Production strip assertions continue to pass on both hosts.
