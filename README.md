# Nudge UI

## What this is

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

<img width="2888" height="1614" alt="image" src="https://github.com/user-attachments/assets/2f8abf6d-71cc-4823-8042-25a6e6407d74" />


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

## Use the editor

Opening any page of the development server loads it in the Nudge editor. The
canvas toolbar has these tools:

| Tool | Shortcut | Behavior |
| --- | --- | --- |
| Select | `I` | Use the app normally. Nudge doesn't intercept clicks. In Canvas view, links open in a new card. |
| Design | `V` | Click elements to inspect and edit them. The app doesn't receive the click. |
| Pan | `H` | Drag the canvas. |
| Sketch | `P` | Draw on the page. |

In Design, clicks made by scripts, such as `element.click()`, still reach the
app. Only clicks from a person become selections.

## Turn Nudge off

Nudge is on by default in development. To see the plain app:

- **One tab:** add `?nudge-ui=off` to the URL. The tab stays off as you
  navigate. Add `?nudge-ui=on` to turn it back on.
- **One run:** start the development server with `NUDGE_UI=0`, for example
  `NUDGE_UI=0 pnpm dev`.
- **Permanently:** pass `enabled: false`. For example,
  `withNudgeUi(config, { enabled: false })` or `nudgeUiAstro({ enabled: false })`.

## Screenshots and end-to-end tests

Automated browsers get the plain app. When `navigator.webdriver` is `true`, as
in Playwright, Puppeteer, Selenium, and headless Chrome, Nudge doesn't load the
editor or intercept clicks, so screenshots and tests see the app at its real
URL. The browser console logs one line saying so.

To test with Nudge in an automated browser, use either of these:

- Add `?nudge-ui=on` to the first URL the test opens.
- Start the development server with `NUDGE_UI=1`.

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

### Using MCP

When `@nudge-ui/mcp` is installed, the development integration starts a local
browser bridge. The agent's MCP process discovers that bridge using a private
local session registry. 


Ask agent to call nudge_listen to wait for prompts from UI.

Agents can also push to the canvas e.g. to create variations of different pages, or show a page in different states. Ask the agent to create variations and push them to canvas as different frames

For worktrees run agent setup once in each checkout or worktree. 

### Diagnose a connection

Run diagnostics from the application directory:

```sh
npx nudge-ui agent doctor
```

The inspector's connection panel provides status and recovery instructions.
Disconnecting explicitly revokes the browser connection. Legacy configurations
with `--project-id`, `--origin`, and `--workspace-root` remain supported; see the
[MCP package documentation](packages/mcp/README.md).


## Implementation

The Vite plugin runs only during development. It transforms JSX and TSX to add
stable `data-*` identity, scans CSS and styling-system metadata, publishes
token and component data through virtual modules, and injects the inspector
bootstrap into dev HTML. The Next.js and Astro integrations adapt the same
contracts to their host pipelines. The standalone host uses an HTML response
instrumenter and a manifest instead of build-tool virtual modules.

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


## License

Nudge UI is available under the [MIT License](LICENSE). See [Contributing](CONTRIBUTING.md),
[Security](SECURITY.md), and [Code of Conduct](CODE_OF_CONDUCT.md) for
community guidance.
