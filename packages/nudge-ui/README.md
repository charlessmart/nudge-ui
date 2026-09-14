# nudge-ui

The primary Nudge UI distribution.

Today this package holds the host-neutral implementation that every adapter
shares. It is being assembled in place: the Vite, Next.js, Astro, and
static-HTML adapters move in here as `nudge-ui/vite`, `nudge-ui/next`,
`nudge-ui/astro`, and `nudge-ui/static`, replacing the separately published
`@nudge-ui/*` adapter packages.

## Subpaths

| Subpath | Contents |
| --- | --- |
| `nudge-ui/transport` | Reserved routes, mount ID, and manifest version. Browser-safe. |
| `nudge-ui/project-files` | Safe project-file discovery, path policy, and settled-batch watching. |
| `nudge-ui/project-tokens` | Deterministic project CSS discovery and token-snapshot assembly. |
| `nudge-ui/project-identity` | Deterministic project naming for durable sessions. |

`nudge-ui/transport` must stay free of Node imports, because the inspector's
mount components import the route constants directly. Everything requiring the
filesystem belongs under `project/`. A test in the package enforces this.

These subpaths are implementation seams shared by the adapters, not a stable
public API. They become internal once the adapters move in.
