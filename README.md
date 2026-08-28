# Nudge UI

## What this is

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

## Install

Install the adapter for the host application. The examples in this repository
use `workspace:*`; an external project should use the corresponding published
package or a local package build.

### Vite and React

```sh
pnpm add -D @nudge-ui/plugin
```

Add the plugin after the React plugin in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "@nudge-ui/plugin";

export default defineConfig({
  plugins: [react(), ...nudgeUi()],
});
```

Pass `debug: true` to enable experimental Inspector features such as DOM
parent and child navigation:

```ts
plugins: [react(), ...nudgeUi({ debug: true })]
```

### Next.js

```sh
pnpm add -D @nudge-ui/nextjs
```

Wrap the Next.js configuration:

```ts
import { withNudgeUi } from "@nudge-ui/nextjs";

const nextConfig = {};

export default withNudgeUi(nextConfig);
```

The wrapper adds dev-only source instrumentation, the inspector mount, and the
local manifest transport. It supports Next.js 15.3 through 16.x.

### Astro

```sh
pnpm add -D @nudge-ui/astro
```

Register the integration in `astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import { nudgeUiAstro } from "@nudge-ui/astro";

export default defineConfig({
  integrations: [nudgeUiAstro()],
});
```

### Static HTML

```sh
pnpm add -D @nudge-ui/standalone
pnpm exec nudge-ui serve ./prototype
```

The standalone host serves the directory on loopback, instruments HTML in
memory, watches source files, and reloads the browser after changes.

## Connect a coding agent

Install the optional local companion in the application project:

```sh
pnpm add -D @nudge-ui/mcp
```

Installation makes a best-effort, project-local Codex registration in
`.codex/config.toml`. It never changes the global Codex configuration and does
not fail installation when the project configuration is unavailable. Other
MCP hosts can start the `nudge-mcp` stdio command with the same project ID.

Ask the coding agent to call `nudge_listen` and leave that call active. The
inspector changes its primary action from **Copy prompt** to **Connect agent**.
After explicit pairing, the action becomes **Send prompt** and dispatches the
current immutable change revision directly to the waiting agent. Only one
request can be active at a time; Copy remains available as the fallback.

The agent can also present real, same-origin application routes as a labeled
Canvas comparison group, focus the group, fit the board, read Canvas state, or
remove only a group that it created. Nudge preserves user-created cards and
owns route readiness, placement, and persistence. When the controller page is
closed, a re-armed agent can reopen only the last paired, reachable page.

The companion binds only to loopback, keeps pairings and prompts in memory,
and does not edit source itself. File changes and approvals continue through
the connected coding agent's normal workflow.

## Implementation

The Vite plugin runs only during development. It transforms JSX and TSX to add
stable `data-*` identity, scans CSS and styling-system metadata, publishes
token and component data through virtual modules, and injects the inspector
bootstrap into dev HTML. The Next.js and Astro integrations adapt the same
contracts to their host pipelines. The standalone host uses an HTML response
instrumenter and a manifest instead of build-tool virtual modules.

The browser runtime mounts in a Shadow DOM. It reads the browser's CSSOM and
computed styles to determine what is actually applied. CSS and token previews
use one managed stylesheet; semantic component changes use a framework adapter.
The change log is the handoff boundary: the inspector records the change and
the user either copies a prompt or dispatches that exact revision to a paired
agent. After completion, Nudge removes only changes whose refreshed browser
result can be positively verified.

## Architecture

The repository separates host integration from shared browser behavior:

- `packages/plugin` — Vite transforms, virtual modules, token discovery, and
  dev HTML bootstrap.
- `packages/css` — browser-safe CSS and token models, value semantics, and the
  build-time token inventory.
- `packages/inspector` — selection, CSS inspection, managed previews, changes,
  prompts, and the React runtime.
- `packages/agent-protocol` — host-neutral browser bridge and Canvas command
  contracts.
- `packages/mcp` — the standard MCP stdio server and authenticated local
  browser companion.
- `packages/nextjs`, `packages/astro`, and `packages/standalone` — host
  adapters that publish one runtime configuration contract.
- `examples` — real consumer applications used for end-to-end verification.

Stable `data-*` attributes provide identity across framework re-renders. The
inspector never writes preview styles inline on tracked elements. These rules
keep source identity, browser evidence, and preview behavior independent of a
particular build tool or styling system.

## Test harness

Vitest tests the shared modules and host adapters in `packages/**`. Playwright
drives real consumer applications in `examples/**`, including Vite and React,
Tailwind 3 and 4, vanilla-extract/Sprinkles, static HTML, Next.js, and Astro.
The browser suites cover identity, selection, CSS and token previews, semantic
component behavior, reloads, Canvas where supported, and production stripping.

Run the main checks from the repository root:

```sh
pnpm install
pnpm test:unit
pnpm test:e2e
pnpm typecheck
pnpm lint
```
