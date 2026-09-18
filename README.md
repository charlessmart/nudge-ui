# Nudge UI

## What this is

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

## Editor workspace

Open your application with its usual development command. Nudge opens an editor
workspace with the application in a same-origin iframe. The frame provides the
application's viewport boundary, so viewport units and fixed elements remain
independent of the inspector panel.

The editor starts in **Focus**, with one square-edged preview at 100% zoom and no
inset. The preview resizes with the browser and the available space beside
the inspector. Select **Canvas** in the inspector header to zoom out into the
comparison workspace, where previews have resize handles. Select **Focus** to
return to the active preview. Switching presentation preserves the running
application. Use **Open app** on a canvas preview to open the application in a
separate tab without the editor.

Editor URLs retain the application path, query parameters, and hash, with
`nudge-ui=editor` added to the query string. For example,
`/products?category=tools&nudge-ui=editor#details` edits
`/products?category=tools#details`. The application iframe receives the URL
without the editor marker. Existing `/__nudge_ui__/editor?url=...` links remain
supported.

Editing and comparison use the same workspace. You can keep one preview or
compare multiple routes and agent-generated variations. Links navigate within
their preview. Each live preview runs the application independently, so opening
more previews also runs more application instances. The public landing page
opens the same iframe editor from **Open Nudge** or its floating launcher. The
demo starts in Canvas with the landing page and a small easter-egg page; visitors
can focus either preview. Demo edits remain browser-local, with workspace
persistence and the agent bridge disabled.

## Install

Run the framework-detecting initializer from the application root:

```sh
npm create nudge-ui@latest
```

The initializer detects Next.js, Astro, Vite with React, or static HTML,
installs `nudge-ui`, and updates the host configuration. Use an explicit
framework when detection is ambiguous:

```sh
npm create nudge-ui@latest -- --framework astro
```

### Manual installation

One package serves every host. Install it, then import the subpath matching
the build tool:

```sh
pnpm add -D nudge-ui
```

| Host | Subpath |
| --- | --- |
| Vite with React | `nudge-ui/vite` |
| Next.js | `nudge-ui/next` |
| Astro | `nudge-ui/astro` |
| Static HTML | `nudge-ui/static`, plus the `nudge-ui` command |

Peer dependencies on Vite, Next.js, Astro, React, and React DOM are all
optional, so installing `nudge-ui` never asks for a toolchain the project does
not use.

The examples in this repository use `workspace:*`; an external project should
use the published package or a local build.

### Vite and React

Add the Vite adapter after the React plugin in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { withNudgeUi } from "nudge-ui/vite";

export default withNudgeUi(defineConfig({
  plugins: [react()],
}));
```

Pass `debug: true` to enable experimental Inspector features such as DOM
parent and child navigation:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), { debug: true });
```

For a monorepo, pass authored workspace package directories explicitly with
`sourceRoots`. Dependency and generated-output paths remain outside the
adapter's source scope.

### Next.js

Wrap the Next.js configuration:

```ts
import { withNudgeUi } from "nudge-ui/next";

const nextConfig = {};

export default withNudgeUi(nextConfig);
```

The wrapper adds dev-only source instrumentation, the inspector mount, and the
local manifest transport. It supports Next.js 15.3 through 16.x.

### Astro

Register the integration in `astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import { nudgeUiAstro } from "nudge-ui/astro";

export default defineConfig({
  integrations: [nudgeUiAstro()],
});
```

Automated installs use `withNudgeUi(defineConfig(...))`; the explicit
`nudgeUiAstro()` form above remains supported.

### Static HTML

```sh
pnpm exec nudge-ui serve ./prototype
```

The standalone host serves the directory on loopback, instruments HTML in
memory, watches source files, and reloads the browser after changes. It does
not serve dot-prefixed files or directories, including `.env` files.

## Connect a coding agent

> **Early alpha:** The MCP integration is still under heavy testing. Expect
> breaking changes, incomplete host compatibility, and other rough edges. Do
> not rely on it for production workflows yet.

### Guided setup

Run the initializer from the application directory:

```sh
npm create nudge-ui@latest
```

Choose **Connect a coding agent**, then select your agent. The initializer
installs the compatible local MCP package and registers its executable for this
project. Start the application with its usual development command. Reload the
agent after changing its configuration, then ask it to **listen to Nudge**.

For an existing Nudge installation, run:

```sh
npx nudge-ui agent setup
```

Setup is also available directly through the initializer:

```sh
npm create nudge-ui@latest -- --agent-only
```

Use `--agent <agent-id>` to select an agent without the interactive selection,
`--no-mcp` to skip agent setup during initialization, and `--dry-run` to inspect
planned changes. Package installation itself does not prompt or modify agent
configuration. Registration uses the locally installed executable, so package
upgrades and the lockfile determine the MCP version.

### Project and worktree sessions

When `@nudge-ui/mcp` is installed, the development integration starts a local
browser bridge. The agent's MCP process discovers that bridge using a private
local session registry. Browser origins and bridge ports are runtime details;
you do not need to copy them into agent configuration.

The agent can call `nudge_list_sessions` to inspect available applications and
`nudge_listen` to wait for a prompt. Selection matches the canonical workspace
and application path. Different Git worktrees remain separate even when they
share a repository or branch name. Multiple matching application sessions
require an explicit selection; Nudge never silently selects another worktree.
Run agent setup once in each checkout or worktree. Generated agent entries bind
to that application's absolute path; rerun setup after moving a checkout or
copying an agent configuration from another worktree.

A connected browser is not necessarily ready to send. The agent must keep a
listening call active. After applying a prompt, it reports status and listens
again. Only one request can be active for a project, and competing agents cannot
silently take over its request workflow. Prompts are not queued for an idle
agent or replayed after a restart. **Copy prompt** remains available.

### Diagnose a connection

Run diagnostics from the application directory:

```sh
npx nudge-ui agent doctor
```

Diagnostics report running project sessions and their connection state; they do
not verify the agent host's loaded tool catalog. If no project session is
available, start the development server. If the agent's tool catalog does not
include Nudge, reload the agent
following registration. If the browser is connected but idle, ask the agent to
listen to Nudge.

The inspector's connection panel provides status and recovery instructions.
Disconnecting explicitly revokes the browser connection. Legacy configurations
with `--project-id`, `--origin`, and `--workspace-root` remain supported; see the
[MCP package documentation](packages/mcp/README.md).

The agent can also present real, same-origin application routes as a labeled
Canvas comparison group, focus the group, fit the board, read Canvas state, or
remove only a group it created. Nudge preserves user-created cards and owns
route readiness, placement, and persistence.

The bridge binds only to loopback and keeps pairings and prompts in memory. Its
private registry stores discovery credentials, not prompts. Nudge does not edit
source itself: file changes and approvals continue through the coding agent's
normal workflow.

Contributors can run `pnpm test:agent-integration` to verify a built development
host, a separate stdio MCP process, session discovery, prompt delivery, status
reporting, and shutdown without configuring a personal agent.

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

The editor mounts its controls in a Shadow DOM in a dedicated development
document. Application iframes run renderer clients, which report selection and
apply the editor's shared changes. The runtime reads each application's CSSOM
and computed styles to determine what is actually applied. CSS and token
previews use a managed stylesheet in each application document; semantic
component changes use a framework adapter.
The change log is the handoff boundary: the inspector records the change and
the user either copies a prompt or dispatches that exact revision to a paired
agent. After completion, Nudge removes only changes whose refreshed browser
result can be positively verified.

## Architecture

The repository separates its public products from private implementation:

- `packages/nudge-ui` — the inspector, shared compiler and CSS model, and the
  Vite, Next.js, Astro, and static HTML hosts.
- `packages/mcp` — the optional MCP stdio server and authenticated local
  browser companion.
- `packages/create-nudge-ui` — framework detection, package installation, and
  host configuration.
- `packages/agent-protocol` — private shared browser bridge and Canvas command
  contracts compiled into `nudge-ui` and `@nudge-ui/mcp`.
- `packages/compatibility` — private compatibility fixtures shared by tests.
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
component behavior, reloads, iframe workspaces, and production stripping.

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
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

The tag starts the npm release workflow. It validates that every public package
matches the tag, runs the required unit suite, builds and verifies the package
archives once, and submits those exact archives with `npm stage publish`.
Review the three entries on npm's **Staged Packages** page and approve them with
2FA in dependency order: `nudge-ui`, `@nudge-ui/mcp`, then
`create-nudge-ui`.

Each package must trust the `charlessmart/nudge-ui` GitHub repository and the
`publish.yml` workflow on npm. Configure the trusted publisher for staged
publishing only; no GitHub environment name is used. npm CLI 11.15 or newer is
required for local staged-package commands.

## License

Nudge UI is available under the [MIT License](LICENSE). See [Contributing](CONTRIBUTING.md),
[Security](SECURITY.md), and [Code of Conduct](CODE_OF_CONDUCT.md) for
community guidance.
