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

Only the host subpaths in the table above are public. Everything else is
internal and may change without notice. See
[ADR-0023](../../docs/adr/0023-one-package-with-host-subpaths.md).
