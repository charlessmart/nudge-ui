# `@nudge-ui/mcp`

> **Early alpha:** This integration is still under heavy testing. Expect
> breaking changes, incomplete host compatibility, and other rough edges. Do
> not rely on it for production workflows yet.

`@nudge-ui/mcp` connects a local Nudge UI inspector to an MCP-capable coding
agent. It combines a standard MCP stdio server with a project-scoped loopback
browser bridge. The browser does not speak MCP directly.

## Install

```sh
pnpm add -D @nudge-ui/mcp@0.2.0
```

### Configure automatically

From the application project root, use [`add-mcp`](https://github.com/neon-solutions/add-mcp) to detect supported coding agents and write each host's native configuration format:

```sh
npx add-mcp \
  'npx -y @nudge-ui/mcp@0.2.0 --project-id my-app --origin http://localhost:5173 --workspace-root .' \
  --name nudge_ui
```

The command prompts for detected project agents. Use `-a codex` (or another
supported agent name) to target one host, or `-y` to skip the prompt and use
the detected project agents. Keep this project-scoped; do not use `-g` unless
the configuration intentionally targets one fixed project.

`--origin` must exactly match the development application's browser origin.
The `--project-id` value must match the ID used by the Nudge host integration.
For standard Vite and Astro projects, `my-app` normally matches the project
directory name. Next.js and standalone HTML projects use host-specific IDs, so
retain the explicit ID from their integration configuration.

The generated command pins the published `@nudge-ui/mcp@0.2.0` package through
`npx` for reproducible tool versions. Update the version deliberately when
upgrading the MCP integration. After configuration, restart or reload the
agent host so it refreshes its MCP tool catalog.

The package has no install-time project mutation. The manual configuration
below remains useful when an agent host is not supported by `add-mcp` or when
you need an explicit custom command.

After adding or changing the host configuration, restart or reload the MCP
server, or start a fresh agent task. Open **Connect MCP** from the inspector's
prompt menu for setup instructions, connection status, and explicit pairing.
You can pair a page before the agent starts listening. Ask the agent to call
`nudge_listen` and keep it active to enable sending. **Copy prompt** remains
available while the agent is idle; prompts are not queued.

For Codex desktop, confirm that `nudge_ui` appears in the current task after
the MCP restart. For Codex CLI, `codex mcp list` verifies the project entry.
Restart a long-running OpenCode service after adding or changing its MCP
configuration so it refreshes its tool catalog.

## Run manually

```sh
pnpm exec nudge-mcp \
  --project-id my-app \
  --origin http://localhost:5173 \
  --workspace-root /path/to/my-app
```

Pass the exact application origin with `--origin` (or
`NUDGE_UI_ORIGIN`). The bridge rejects browser origins that are not explicitly
configured; it never trusts the first origin that connects. The bridge chooses
a deterministic loopback port from the project ID so the inspector can find
it without a port file. Use `--port 0` for an ephemeral test port.

For integrations that establish the browser origin out of band, trusted host
code can use the `pairBrowser` API as an explicit manual approval path. An
unconfigured bridge does not accept HTTP pairing requests.

The agent should call `nudge_listen` immediately, apply the delivered prompt
through its normal source-editing workflow, call `nudge_report_status`, and
listen again. Canvas tools are limited to same-origin routes and agent-owned
groups.
