# Nudge UI

Nudge UI is a development-only visual inspector that turns browser edits into
requests for your coding agent. Inspect a running app, preview design changes,
add comments and sketches, and copy a structured prompt or send it through MCP.

Nudge previews changes to your app without editing application source files.
Your coding agent implements the request. You can also explore independent HTML
iterations before choosing a design to apply to the app.

![Nudge UI visual inspector](https://github.com/user-attachments/assets/2f8abf6d-71cc-4823-8042-25a6e6407d74)

## Get started

Run the initializer from your application's root directory:

```sh
npm create nudge-ui@latest
```

It detects Next.js, Astro, Vite with React, or static HTML, installs `nudge-ui`,
and configures the integration. It also offers to connect a coding agent.
Start your app with its usual development command and open the local URL.
For static HTML, use the `nudge-ui serve` command printed by setup.

In a monorepo, run setup inside the app directory. If detection is ambiguous,
select `nextjs`, `astro`, `vite-react`, or `standalone` with `--framework`:

```sh
npm create nudge-ui@latest -- --framework astro
```

Published packages require Node.js 20 or later; your framework may require a
newer version. This repository requires Node.js 22.12 or later and pnpm 10.

## Packages

Only these three packages are published to npm:

| Package | Purpose | Documentation |
| --- | --- | --- |
| [`nudge-ui`](https://www.npmjs.com/package/nudge-ui) | Browser inspector, Canvas workspace, and framework integrations. | [Setup and usage](packages/nudge-ui/README.md) |
| [`create-nudge-ui`](https://www.npmjs.com/package/create-nudge-ui) | Add Nudge to an existing app and optionally configure a coding agent. | [Commands and options](packages/create-nudge-ui/README.md) |
| [`@nudge-ui/mcp`](https://www.npmjs.com/package/@nudge-ui/mcp) | Connect the editor to a coding agent for requests, status, and Canvas comparisons. | [Agent workflow and tools](packages/mcp/README.md) |

For manual installation, install `nudge-ui` as a development dependency and
use the host subpath: `nudge-ui/vite`, `nudge-ui/next`, `nudge-ui/astro`, or
`nudge-ui/static`. See the [package README](packages/nudge-ui/README.md#manual-installation)
for configuration examples and supported versions.

## Design in the browser

Select an element to inspect its live CSS and source context. Preview changes
to layout, spacing, typography, colors, backgrounds, borders, shadows, text,
design tokens, and supported component props. Undo and redo let you revisit
edits and frame changes.

| Tool | Shortcut | Action |
| --- | --- | --- |
| Select | `V` | Select elements to inspect and edit. |
| Comment | `C` | Leave a note on an element for your agent. |
| Pencil | `P` | Draw and add sketch notes. |
| Use app normally | Hold `A` in Canvas | Interact with the app. This tool is also available in the toolbar. |

Hold `Space` to pan the canvas. Open app routes in frames and resize them to
compare viewport sizes. **Duplicate** creates a linked live frame.
**Iteration** captures an independent HTML design with its own edits.

HTML iterations are stored under `.nudge/artifacts/`. They capture rendered
HTML and CSS without the app's scripts. You can ask an agent to refine an
iteration, then use **Copy prompt for live app** to implement that design in
application source. The [usage guide](packages/nudge-ui/README.md#use-the-editor)
also explains local persistence and comment reconciliation.

## Connect a coding agent

Agent setup is offered during initialization. To add or repair it later, run
this from the app directory:

```sh
npx nudge-ui agent setup
```

Setup installs the project bridge dependency and a reusable adapter outside
your repositories, then registers the adapter globally for your selected agents.
Fully restart your agent host, start the app, and ask the agent
to **listen to Nudge in this workspace**. Keep that turn active while sending
changes.

The agent can receive edits, comments, and sketches, report progress, and
present same-origin routes as Canvas comparison groups. Copied prompts work
without MCP. The MCP integration is early alpha; see the
[coding-agent guide](docs/agent-integration.md) for setup details, session scope,
host limitations, and custom integrations.

For diagnostics, run:

```sh
npx nudge-ui agent doctor
```

## Development and automated tests

Nudge is enabled by default in development. Standard production builds contain
no inspector bootstrap, identity attributes, or token data.

- **One tab:** Add `?nudge-ui=off`. Add `?nudge-ui=on` to enable it again.
- **One server run:** Start with `NUDGE_UI=0`, for example `NUDGE_UI=0 pnpm dev`.
- **Framework configuration:** Pass `enabled: false`, for example
  `withNudgeUi(config, { enabled: false })` or `nudgeUiAstro({ enabled: false })`.

Automated browsers with `navigator.webdriver` enabled get the plain app.
To test the editor, add `?nudge-ui=on` to the first URL or start the development
server with `NUDGE_UI=1`.

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
- `packages/mcp` — the optional MCP stdio adapter and project-owned local
  browser bridge.
- `packages/create-nudge-ui` — framework detection, package installation, and
  host configuration.
- `packages/agent-protocol` — private shared browser bridge and Canvas command
  contracts compiled into `nudge-ui` and `@nudge-ui/mcp`.
- `packages/compatibility` — private compatibility fixtures shared by tests.
- `packages/package-css-fixture` — private package-stylesheet discovery fixtures.
- `examples` — real consumer applications used for end-to-end verification.

Stable `data-*` attributes provide identity across framework re-renders. The
inspector never writes preview styles inline on tracked elements. These rules
keep source identity, browser evidence, and preview behavior independent of a
particular build tool or styling system.

Host adapters remain isolated from sibling hosts, except for Astro's integration
with Vite. Browser-facing transport and CSS model modules remain free of Node
imports. See the [host-subpath decision](docs/adr/0023-one-package-with-host-subpaths.md)
and [export policy](docs/adr/0025-supported-and-internal-export-subpaths.md).

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

The default CI verification job runs `check:boundaries`, `build:packages`,
`typecheck`, `lint`, and `test:unit`. `test:unit` is the fast, required suite;
it does not run the inspector UI-integration profile or consumer browser suites.
CI also checks production purity for each host and runs the packed-consumer
smoke tests in separate jobs:

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

All three public packages use the same version. Update their `package.json`
versions and merge the release changes to `main`. Validate the intended stable
SemVer tag and verify the package archives before tagging. For example, if the
new package version is `0.2.3`:

```sh
pnpm release:validate -- v0.2.3
pnpm package:verify
git tag -a v0.2.3 -m "Release v0.2.3"
git push origin v0.2.3
```

The [release workflow](.github/workflows/publish.yml) validates the tag, builds
and tests the packages, verifies their archives, and stages all three on npm.
Review the staged packages in npm's Staged Packages page and approve them with
2FA to publish. Pushing the tag alone does not publish them.

To retry staging an existing release tag, run the workflow manually with its
`tag` input. Packages already published at that version are skipped.

## License

Nudge UI is available under the [MIT License](LICENSE).
