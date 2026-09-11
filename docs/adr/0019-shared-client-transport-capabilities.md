# ADR-0019: Shared client transport capabilities

Date: 2026-09-10
Status: Accepted

## Context

ADR-0018 introduced a self-contained inspector client and migrated Astro first.
The existing Vite/React, Next.js, and standalone hosts still delivered separate
inspector bootstraps. Next.js compiled the inspector UI through the application
compiler, standalone built a second copy of the complete client, and Vite added
React aliases so its optimizer could own the inspector dependency graph.

The hosts also need different development lifecycles. Next.js refreshes runtime
knowledge without replacing the document. Standalone reloads the document and
must install runtime identity and reconcile token declaration order from the
active browser stylesheets.

## Decision

Vite/React, Next.js, Astro, and standalone serve the same
`@nudge-ui/inspector/client` artifact and the versioned client manifest from
development-only `/__nudge_ui__/` routes.

Represent host lifecycle differences as optional, validated manifest
capabilities:

- `document` requests static-HTML identity or browser stylesheet-order
  reconciliation before the inspector mounts.
- `reload` supplies a same-origin event endpoint and selects either runtime
  manifest refresh or document reload.

These fields carry plain data. Host framework objects and host React instances
do not cross the transport. The React Adapter continues to compile with each
application and registers through the page-global Interface from ADR-0018.

The explicit landing demo remains on its build-time virtual bootstrap. It is a
static public artifact with route-sensitive demo behavior, not an installed
development host, and therefore has no development server manifest route.

## Consequences

- Installed Vite projects no longer receive React or React DOM aliases from
  Nudge UI.
- Next.js no longer compiles the inspector UI dependency graph.
- Standalone no longer builds or publishes a second inspector client and no
  longer needs React development dependencies.
- Document and reload behavior remains declarative and versioned rather than
  branching on host names inside the shared client.
- A future host can reuse the client without adopting React for its own UI or
  copying an existing host bootstrap.

## Verification

- Package unit tests cover the shared manifest, each transport, and the legacy
  landing-demo exception.
- Vite and Next.js consumer tests verify React component semantics through the
  host Adapter seam.
- Standalone browser tests verify static identity, Canvas, token refresh, and
  document reload while serving the shared client artifact.
