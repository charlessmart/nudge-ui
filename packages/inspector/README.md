# `@nudge-ui/inspector`

`@nudge-ui/inspector` is the browser runtime for the Nudge UI development
inspector. It selects rendered elements, reads the browser CSSOM, previews CSS
and component changes, records immutable change revisions, and prepares the
prompt or agent handoff.

## Install

```sh
pnpm add @nudge-ui/inspector react react-dom
```

Most projects should install a host adapter instead:

- `@nudge-ui/vite-react` for Vite + React
- `@nudge-ui/nextjs` for Next.js
- `@nudge-ui/astro` for Astro
- `@nudge-ui/standalone` for static HTML

Install the inspector directly only when implementing a custom host adapter.

## Mount the runtime

Custom hosts provide a development-only host element and call
`bootstrapNudgeUi`:

```ts
import { bootstrapNudgeUi } from "@nudge-ui/inspector";

const host = document.getElementById("nudge-ui-root");
if (host instanceof HTMLElement) bootstrapNudgeUi(host);
```

The runtime is gated for development use. It mounts its UI in a Shadow DOM,
uses one managed stylesheet for CSS previews, and does not edit application
source files.

## Public runtime helpers

The package also exports `mountInspector`, `unmountInspector`, inspector
controls, browser inspection helpers, runtime configuration, and the React
component-runtime entry at `@nudge-ui/inspector/component-runtime`.
