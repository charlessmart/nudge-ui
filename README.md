# Nudge UI

## What this is

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

## Install

Run the framework-detecting initializer from the application root:

```sh
npm create nudge-ui@latest
```

The initializer detects Next.js, Astro, Vite with React, or static HTML,
installs the corresponding host adapter, and updates the host configuration.
Use an explicit framework when detection is ambiguous:

```sh
npm create nudge-ui@latest -- --framework astro
```

### Manual installation

Install the adapter for the host application when automatic setup is not
appropriate. The examples in this repository use `workspace:*`; an external
project should use the corresponding published package or a local package
build.

### Vite and React

```sh
pnpm add -D @nudge-ui/vite-react
```

Add the Vite React adapter after the React plugin in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "@nudge-ui/vite-react";

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

Automated installs use `withNudgeUi(defineConfig(...))`; the explicit
`nudgeUiAstro()` form above remains supported.

### Static HTML

```sh
pnpm add -D @nudge-ui/standalone
pnpm exec nudge-ui serve ./prototype
```

The standalone host serves the directory on loopback, instruments HTML in
memory, watches source files, and reloads the browser after changes. It does
not serve dot-prefixed files or directories, including `.env` files.

## Connect a coding agent

> **Early alpha:** The MCP integration is still under heavy testing. Expect
> breaking changes, incomplete host compatibility, and other rough edges. Do
> not rely on it for production workflows yet.

### Configure the MCP host automatically

From the application project root, use [`add-mcp`](https://github.com/neon-solutions/add-mcp) to detect supported coding agents and write each host's native configuration format:

```sh
npx add-mcp \
  'npx -y @nudge-ui/mcp@0.1.3 --project-id my-app --origin http://localhost:5173 --workspace-root .' \
  --name nudge_ui
```

The command prompts for the detected project agents. Pass `-a codex` (or
another supported agent name) to target one host, or `-y` to skip the prompt
and use the detected project agents. Keep this project-scoped; do not use
`-g` unless the configuration intentionally targets one fixed project.

`--origin` must exactly match the development application's browser origin.
The `--project-id` value must match the ID used by the Nudge host integration.
For standard Vite and Astro projects, `my-app` normally matches the project
directory name. Next.js and standalone HTML projects use host-specific IDs, so
retain the explicit ID from their integration configuration.

The generated command pins the published `@nudge-ui/mcp@0.1.3` package through
`npx` for reproducible tool versions. Update the version deliberately when
upgrading the MCP integration. After configuration, restart or reload the
agent host so it refreshes its MCP tool catalog.

### Install the companion locally

You can also install the optional local companion in the application project:

```sh
pnpm add -D @nudge-ui/mcp@0.1.3
```

Installation does not modify project or global tool configuration. Configure
the MCP host explicitly to run `nudge-mcp` with the project's stable ID,
workspace root, and exact development origin. For example, the command for a
Vite project might be:

```sh
pnpm exec nudge-mcp \
  --project-id my-app \
  --origin http://localhost:5173 \
  --workspace-root /path/to/my-app
```

After adding or changing the MCP host entry, restart or reload the host's MCP
server, or start a fresh agent task, so the host refreshes its tool catalog.

Open **Connect MCP** from the inspector's prompt menu to view setup instructions
and pair with the local companion. Pairing can complete before the agent starts
listening. Then ask the coding agent to call `nudge_listen` and leave that call
active. Once paired and ready, **Send prompt** dispatches the current immutable
change revision directly to the waiting agent. Only one request can be active
at a time; **Copy prompt** remains the fallback while the agent is idle.

If the inspector continues to show **Copy prompt** while the local companion
is running, the agent host has probably not started `nudge_listen`. The
companion can be reachable before a listener exists. In Codex desktop, verify
that `nudge_ui` is available to the current task after restarting the MCP
server. In Codex CLI, run `codex mcp list` from the project root. Long-running
services such as OpenCode should be restarted or reloaded after MCP config
changes.

The agent can also present real, same-origin application routes as a labeled
Canvas comparison group, focus the group, fit the board, read Canvas state, or
remove only a group that it created. Nudge preserves user-created cards and
owns route readiness, placement, and persistence. When the controller page is
closed, a re-armed agent can reopen only the last paired, reachable page.

The companion binds only to loopback, keeps pairings and prompts in memory,
and does not edit source itself. File changes and approvals continue through
the connected coding agent's normal workflow.

Nudge UI stores development-only inspector state in origin-scoped browser
storage. See [Browser storage](docs/browser-storage.md) for the stored data,
retention, transport caveats, and clearing instructions.

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
- `packages/create-nudge-ui` — framework detection, adapter installation, and
  host-configuration setup.
- `packages/css` — browser-safe CSS and token models, value semantics, and the
  build-time token inventory.
- `packages/inspector` — selection, CSS inspection, managed previews, changes,
  prompts, and the React runtime.
- `packages/agent-protocol` — host-neutral browser bridge and Canvas command
  contracts.
- `packages/mcp` — the early-alpha MCP stdio server and authenticated local
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

Run the fast checks from the repository root:

```sh
pnpm install
pnpm build:packages
pnpm typecheck
pnpm lint
pnpm test:unit
```

The default CI verification job runs `build:packages`, `typecheck`, `lint`,
and `test:unit`. `test:unit` is the fast, required suite; it does not run the
inspector UI-integration profile or consumer browser suites. CI also runs the
packed-consumer smoke tests in a separate job:

```sh
pnpm test:packed-consumers
```

Run the slower or targeted profiles explicitly when needed:

```sh
pnpm test:ui-integration
pnpm test:full
pnpm test:e2e
pnpm test:e2e:standalone
pnpm test:compat
pnpm package:verify
```

`test:ui-integration` exercises the real Select, Combobox, and Autocomplete
adapters in jsdom. `test:full` combines the unit and UI-integration profiles.
The full consumer E2E, compatibility, and package-archive checks remain
explicit release or manual checks.

`pnpm lint:oxlint` is an optional, non-gating anti-slop lint. Use it to catch
particularly risky or low-signal code patterns; its findings do not block CI.

## Releases

All public packages use one version. Update their `package.json` versions,
merge the change to `main`, then create and push an annotated stable SemVer tag:

```sh
git tag -a v0.1.3 -m "Release v0.1.3"
git push origin v0.1.3
```

The tag starts the npm release workflow. It validates that every public package
matches the tag, runs the required unit suite, builds and verifies the package
archives once, and submits those exact archives with `npm stage publish`.
Review the nine entries on npm's **Staged Packages** page and approve them with
2FA to make the release public.

Each package must trust the `charlessmart/nudge-ui` GitHub repository and the
`publish.yml` workflow on npm. Configure the trusted publisher for staged
publishing only; no GitHub environment name is used. npm CLI 11.15 or newer is
required for local staged-package commands.

## License

Nudge UI is available under the [MIT License](LICENSE). See [Contributing](CONTRIBUTING.md),
[Security](SECURITY.md), and [Code of Conduct](CODE_OF_CONDUCT.md) for
community guidance.
