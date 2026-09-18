# `@nudge-ui/mcp`

> **Early alpha:** This integration can make breaking changes while host
> support and the setup workflow stabilize.

`@nudge-ui/mcp` connects a local Nudge inspector to an MCP-capable coding
agent. The development server owns the browser bridge. The agent host starts a
small stdio adapter that discovers live bridges in the current checkout or Git
worktree.

## Configure an agent

The Nudge initializer can install the dependency and configure supported agent
hosts. A manual project-scoped configuration uses this command:

```sh
node ./node_modules/@nudge-ui/mcp/dist/cli.mjs --workspace-root /path/to/project
```

The adapter does not need an origin, port, project ID, or branch. A running
development integration registers those values in a private per-user runtime
directory. Restart the agent host after changing its MCP configuration, then
ask it to **Listen to Nudge**. Agent configuration contains absolute checkout
and application paths, so rerun agent setup in each clone or Git worktree that
you intend the agent to edit.

Run diagnostics without starting MCP stdio framing:

```sh
node ./node_modules/@nudge-ui/mcp/dist/cli.mjs doctor --workspace-root /path/to/project
```

The doctor reports live and exact-workspace session counts. It never prints
control credentials.

## Project integration

Framework adapters start and stop the project bridge with the development
server:

```ts
import { startProjectBridge } from "@nudge-ui/mcp/project";

const runtime = await startProjectBridge({
  workspaceRoot: process.cwd(),
  appRoot: process.cwd(),
  projectId: "my-app",
  origin: "http://localhost:5173",
  allowedOrigins: ["http://127.0.0.1:5173"],
});

// Give browser code only these non-secret values.
console.log(runtime.browser.bridgeUrl, runtime.browser.projectId);

await runtime.close();
```

`origin` must be the actual canonical development origin after the framework
chooses its port. `workspaceRoot` defaults to the Git worktree root when one is
available and otherwise defaults to `appRoot`. `appRoot` distinguishes several
applications running from one monorepo.

Each live bridge registers a random session ID, canonical workspace and app
paths, optional Git common directory and branch metadata, origin, and loopback
endpoint. The descriptor is mode `0600` inside a mode `0700` registry. It also
contains a private random credential used only between the bridge and adapter.

The adapter lists all live local sessions through `nudge_list_sessions`, but it
can listen only to sessions whose canonical workspace and configured
application path match. An adapter configured at the worktree root can select
any app in that worktree explicitly. A branch name or shared Git common
directory never causes fallback to another worktree. When several apps run in
one workspace, pass the chosen `sessionId` to `nudge_listen`. The adapter keeps
that app selection across a bridge restart and does not replay old requests.

One adapter owns a selected project session until it closes. Other adapters
receive a claimed-session error instead of taking browser work. A heartbeat
allows the bridge to recover a claim after an adapter process is killed. Call
`nudge_release` when the user stops listening so another adapter can claim the
session without restarting the MCP host.

## Legacy coupled mode

Passing `--origin` retains the previous behavior in which the MCP process also
owns its browser bridge:

```sh
pnpm exec nudge-mcp \
  --project-id my-app \
  --origin http://localhost:5173 \
  --workspace-root /path/to/my-app
```

This mode remains available for custom integrations during migration. New
framework integrations should use the project-owned bridge.

The agent calls `nudge_listen`, applies the delivered prompt, reports the
result through `nudge_report_status`, and listens again. Canvas tools remain
limited to routes from the paired application origin and agent-owned groups.
