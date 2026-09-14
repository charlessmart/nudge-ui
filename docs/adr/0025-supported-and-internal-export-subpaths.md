# ADR-0025: Separate supported and internal export subpaths

## Status

Accepted. This supersedes ADR-0024 only where it classified package-owned
runtime entries as public. ADR-0024's package-folding decision remains in
effect.

## Context

ADR-0024 exposed every module that crossed the npm package boundary. After the
hosts and shared libraries moved into one `nudge-ui` package, several of those
exports crossed only a runtime boundary inside that package. Vite injects the
inspector bootstrap, the JSX compiler injects the React component runtime, and
the hosts resolve the browser client. Applications do not call those modules.

The export map also retained direct aliases for implementation modules already
available through a host entry. Publishing these names would make all of them
part of the apparent API before the consolidated package's first release.

## Decision

The supported package surface consists of the four host entries and two
consumer utilities:

| Subpath | Purpose |
| --- | --- |
| `nudge-ui/vite` | Vite with React integration and Vite token types. |
| `nudge-ui/next` | Next.js integration. |
| `nudge-ui/astro` | Astro integration. |
| `nudge-ui/static` | Static HTML server API. |
| `nudge-ui/testing` | Conformance fixtures for consumer tests. |
| `nudge-ui/virtual-design-tokens` | Ambient declarations for the token transport. |

Package-owned runtime imports use explicit internal names:

| Subpath | Owner |
| --- | --- |
| `nudge-ui/internal/client` | Host client-asset servers. |
| `nudge-ui/internal/inspector` | Vite's generated bootstrap module. |
| `nudge-ui/internal/component-runtime` | JSX instrumentation in Vite and Next.js. |
| `nudge-ui/internal/host-runtime` | Host runtime conformance checks. |
| `nudge-ui/internal/next/mount` | Next.js root-layout instrumentation. |

The host adapters may emit or resolve these internal specifiers because they
ship at the same version as their targets. Application and third-party adapter
code must not import them. They carry no semantic-versioning compatibility
promise.

Remove the redundant `vite/tokens`, `next/loader`, `next/mount`,
`next/component-runtime`, `astro/bootstrap`, `static/bootstrap`,
`static/manifest`, and `static/server` aliases. Token types come from
`nudge-ui/vite`; Next.js transform helpers remain available from
`nudge-ui/next`; static APIs remain available from `nudge-ui/static`. The
legacy Astro bootstrap is deleted because the self-contained client transport
replaced it.

The package verifier owns the exact export list so a new export requires a
deliberate compatibility decision.

## Consequences

- Consumers still install `nudge-ui`; release packaging is governed separately
  by ADR-0026.
- Documentation and editor completion show a small supported API instead of
  package wiring.
- Runtime-generated imports remain resolvable without presenting them as
  application APIs.
- A future third-party adapter API needs a coherent supported entry such as
  `nudge-ui/adapter`; internal runtime modules do not become that API by
  accident.
