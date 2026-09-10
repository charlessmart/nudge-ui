# `@nudge-ui/inspector`

`@nudge-ui/inspector` is the browser runtime for the Nudge UI development
inspector. It selects rendered elements, reads the browser CSSOM, previews CSS
and component changes, records immutable change revisions, and prepares the
prompt or agent handoff.

Host Adapters serve `@nudge-ui/inspector/client` as an external,
self-contained development asset and provide a versioned JSON document shaped
by `@nudge-ui/inspector/client-manifest`. The client owns its React and UI
dependencies; consumers do not bundle them.

Framework semantics stay in the host graph. The React component runtime uses
the host's React installation and registers through
`@nudge-ui/inspector/host-runtime`. Values crossing that seam are bounded to
DOM inspection inputs and plain component metadata, scalar props, and override
commands.

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

Custom React hosts that enable component semantics must also load the host
React Adapter before restoring component overrides:

```ts
import "@nudge-ui/inspector/component-runtime";
```

Nudge UI's framework transforms add this import automatically to instrumented
React modules.

The runtime is gated for development use. It mounts its UI in a Shadow DOM,
uses one managed stylesheet for CSS previews, and does not edit application
source files.

## Public runtime helpers

The package also exports `mountInspector`, `unmountInspector`, inspector
controls, browser inspection helpers, runtime configuration, and the React
component-runtime entry at `@nudge-ui/inspector/component-runtime`.

## Source layout

The package entry point remains at `src/index.ts`. Implementation modules are
grouped by the behavior they own:

- `runtime/` owns bootstrap configuration, development gating, host identity,
  and browser-realm helpers.
- `shell/` owns the inspector panel and its presentation state.
- `selection/` owns selected-element identity, hierarchy, and edit scope.
- `overlay/` owns document interaction, geometry, measurement, and structural
  gestures.
- `changes/` owns canonical workspace intent and history.
- `projection/` compiles and applies document-local previews.
- `inline-text/` owns the temporary native text-editing session.
- `inspection/` owns browser CSS inspection and the external inspection bridge.

Host and Canvas renderer code consume the same workspace snapshot and document
projection interfaces. Keep browser-local nodes, markers, and observers inside
the projection and overlay modules; they must not become canonical change data.
