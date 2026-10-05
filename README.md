# Nudge UI

Nudge, a design panel for your codebase. 
It is a development-only visual inspector that turns browser edits into
prompts for your coding agent. Inspect a running app, preview design changes,
add comments and sketches, and copy a structured prompt or send it through MCP.

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

## Manual install

For manual installation, install `nudge-ui` as a development dependency and
use the host subpath: `nudge-ui/vite`, `nudge-ui/next`, `nudge-ui/astro`, or
`nudge-ui/static`. See the [package README](packages/nudge-ui/README.md#manual-installation)
for configuration examples and supported versions.

## Design in the browser


| Tool | Shortcut | Action |
| --- | --- | --- |
| Select | `V` | Select elements to inspect and edit. |
| Comment | `C` | Leave a note on an element for your agent. |
| Pencil | `P` | Draw and add sketch notes. |
| Use app normally | Hold `A` | Interact with the app. |
| Pan | `Space` | Move around canvas |

Open app routes in frames and resize them to
compare viewport sizes. 

**Duplicate** creates a linked live frame.

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


## License

Nudge UI is available under the [MIT License](LICENSE).
