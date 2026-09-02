# `@nudge-ui/mcp`

`@nudge-ui/mcp` connects a local Nudge UI inspector to an MCP-capable coding
agent. It combines a standard MCP stdio server with a project-scoped loopback
browser bridge. The browser does not speak MCP directly.

## Install

```sh
pnpm add -D @nudge-ui/mcp
```

The package has no install-time project mutation. Configure the MCP host
explicitly to run `nudge-mcp` with the project ID, workspace root, and exact
development origin shown below. Use the host's normal project-local or global
configuration workflow.

After adding or changing the host configuration, restart or reload the MCP
server, or start a fresh agent task. Then ask the agent to call `nudge_listen`
immediately and keep it active. The inspector can only offer **Connect agent**
after that call is active; **Copy prompt** is the expected fallback while no
listener is running.

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
