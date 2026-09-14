# nudge-ui

The Nudge UI distribution. One package, one subpath per host.

```sh
pnpm add -D nudge-ui
```

## Hosts

| Subpath | Host | Entry point |
| --- | --- | --- |
| `nudge-ui/vite` | Vite with React | `withNudgeUi(defineConfig(...))` |
| `nudge-ui/next` | Next.js 15.3 – 16.x | `withNudgeUi(nextConfig)` |
| `nudge-ui/astro` | Astro | `nudgeUiAstro()` |
| `nudge-ui/static` | Static HTML | the `nudge-ui serve` command |

Peer dependencies on Vite, Next.js, Astro, React, and React DOM are all
optional. Installing this package never asks for a toolchain the project does
not use.

## Layout

```
src/
  hosts/vite    Vite lifecycle, CSS observation, transport, bootstrap
  hosts/next    Webpack and Turbopack loaders, sidecar, mount
  hosts/astro   Response-level identity over the Vite integration
  hosts/static  Instrumenting file server and CLI
  inspector/    The browser UI, its client bundle, and the runtime bridge
  compiler/     JSX identity injection and component contract extraction
  css/          Token model, value semantics, dialects, token inventory
  transport/    Reserved routes, mount ID, manifest version
  project/      File discovery, path policy, watching, token snapshots
  html/         parse5 identity instrumentation
```

A host must not import a sibling host. `scripts/check-package-boundaries.mjs`
enforces this; Astro's dependency on Vite is the one documented exception,
because Astro is a Vite host.

`transport/` must stay free of Node imports, because the inspector's mount
components import the route constants directly. Anything needing the filesystem
belongs under `project/`. A test in the package enforces this.

`css/index.ts`, `css/model`, and `css/value-semantics` are browser-safe and
must not import Node, React, PostCSS, or anything under `hosts/` or
`inspector/`. `src/css/importGraph.test.ts` enforces that.

## Supported public surface

The host subpaths above and the following utility subpaths follow semantic
versioning:

| Subpath | Purpose |
| --- | --- |
| `nudge-ui/testing` | Conformance fixtures for consumer tests. |
| `nudge-ui/virtual-design-tokens` | Ambient types for the transport module. |

Exports under `nudge-ui/internal/*` are package-owned implementation details.
The host adapters inject or resolve these imports; application code must not
import them directly. They may change without notice.

Everything else is private. See
[ADR-0023](../../docs/adr/0023-one-package-with-host-subpaths.md) and
[ADR-0025](../../docs/adr/0025-supported-and-internal-export-subpaths.md).
