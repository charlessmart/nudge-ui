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
the user copies a prompt for an agent to apply to source.

## Architecture

The repository separates host integration from shared browser behavior:

- `packages/plugin` — Vite transforms, virtual modules, token discovery, and
  dev HTML bootstrap.
- `packages/css` — browser-safe CSS and token models, value semantics, and the
  build-time token inventory.
- `packages/inspector` — selection, CSS inspection, managed previews, changes,
  prompts, and the React runtime.
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
