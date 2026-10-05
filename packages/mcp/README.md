# @nudge-ui/mcp

Send design changes from Nudge UI directly to your coding agent.
`@nudge-ui/mcp` connects the browser editor to an MCP-capable agent so it can
receive your edits, comments, and sketches, implement them, and report progress
back to the editor.

It also lets the agent present app routes as labeled comparison groups in
Canvas. For example, ask it to create design variations and show them side by
side for review.

This package is an optional companion to
[`nudge-ui`](https://www.npmjs.com/package/nudge-ui). You can use Nudge's copied
prompts without installing it.

> **Early alpha:** Host support and setup are still evolving. Expect breaking
> changes and differences in how agent hosts handle long-running listening calls.

## Get started

If Nudge UI is already installed, run this from the application directory:

```sh
npx nudge-ui agent setup
```

For a new Nudge installation, run `npm create nudge-ui@latest` and choose to
connect a coding agent. To configure only the agent integration, use:

```sh
npm create nudge-ui@latest -- --agent-only
```

Then:

1. Fully restart your coding-agent host to load the MCP configuration.
2. Start your app's development server and open Nudge in the browser.
3. Ask the agent to **listen to Nudge in this workspace**.
4. Make visual edits, add comments or sketches, and send the request from Nudge.

The agent receives the request, applies it using its normal permissions and
approval flow, verifies the result, reports status, and listens for the next
request. Keep that agent turn active while sending changes. Delivery confirms
that the agent received a request; it does not confirm implementation.

## How it connects

Setup installs two parts:

- **Project bridge:** A local `@nudge-ui/mcp` development dependency. The Nudge
  framework integration starts the bridge with your development server.
- **Agent adapter:** A reusable MCP stdio process under `~/.nudge-ui/adapters/`,
  registered globally with your selected agent hosts.

The adapter discovers running apps through a private local session registry.
It can serve multiple checkouts and Git worktrees without a separate agent
registration for each one. Each app still needs its Nudge integration and
bridge dependency. Setup requires npm for the reusable adapter, even if the app
uses pnpm, Yarn, or Bun. The package requires Node.js 20 or later.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `nudge_list_sessions` | Discover running apps in the requested workspace. |
| `nudge_listen` | Wait for the next implementation request. `nudge_connect` is an alias. |
| `nudge_get_status` | Read connection and request status. |
| `nudge_report_activity` | Highlight Canvas frames associated with a file read or edit. |
| `nudge_report_status` | Report working, completed, failed, or interrupted status. |
| `nudge_read_canvas` | Read Canvas groups and focus. |
| `nudge_present_routes` | Present same-origin app routes in a labeled comparison group. |
| `nudge_focus_canvas_group` | Focus a comparison group. |
| `nudge_fit_canvas` | Fit all frames into view. |
| `nudge_remove_canvas_group` | Remove an agent-owned comparison group. |
| `nudge_diagnose` | Diagnose local session discovery and connectivity. |
| `nudge_release` | Stop listening and release the session for another agent. |

Supply `workspaceRoot` on every tool call, using the absolute path of the
checkout or application being edited. For example, call `nudge_list_sessions`
with:

```json
{
  "workspaceRoot": "/absolute/path/to/my-app"
}
```

If multiple sessions match, select the app's `sessionId` and include it on
subsequent calls alongside `workspaceRoot`. The adapter does not infer the
current project from its working directory or select a different checkout as
a fallback. One adapter can claim a session at a time.

## Troubleshooting

Run diagnostics from the app directory:

```sh
npx nudge-ui agent doctor
```

Diagnostics report the registry path, workspace scope, reachable sessions, and
invalid, unreachable, or incompatible registrations. If another agent owns the
session, ask it to stop listening and call `nudge_release`.

After updating the adapter, fully restart the agent host. Updating the project's bridge dependency alone does not update the
managed adapter. Update Nudge UI and rerun agent setup, or use the latest
initializer's `--agent-only` mode to update the agent integration.

The MCP adapter delivers requests through an active tool call. It cannot start
a new agent turn after the host has ended the conversation or stopped waiting.
If a listening call times out, ask the agent to listen again and adjust the
host's MCP timeout if supported.

## Custom integrations

Guided setup handles standard framework and agent integrations. For manual
stdio configuration, the `startProjectBridge` API, local tarball testing,
and OpenCode configuration, see
the [coding-agent guide](https://github.com/charlessmart/nudge-ui/blob/main/docs/agent-integration.md).

## Links

[Nudge UI](https://www.npmjs.com/package/nudge-ui) ·
[Initializer](https://www.npmjs.com/package/create-nudge-ui) ·
[Repository](https://github.com/charlessmart/nudge-ui) ·
[Issues](https://github.com/charlessmart/nudge-ui/issues) ·
[MIT license](https://github.com/charlessmart/nudge-ui/blob/main/LICENSE)
