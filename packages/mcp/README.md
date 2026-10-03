# `@nudge-ui/mcp`

> **Early alpha:** This integration can make breaking changes while host
> support and the setup workflow stabilize.

`@nudge-ui/mcp` connects a local Nudge inspector to an MCP-capable coding
agent. The development server owns the browser bridge. The agent host starts a
small stdio adapter installed independently of any checkout. Each tool call supplies
the checkout or application being edited.

## Configure an agent

Run `npx nudge-ui agent setup` from an application, or
`npm create nudge-ui@latest -- --agent-only`. Setup installs:

- A project-local `@nudge-ui/mcp` dependency for the development server's bridge.
- A versioned adapter under `~/.nudge-ui/adapters/<initializer-version>/` using npm.

Setup registers the adapter globally with an absolute Node executable and adapter
entry path. The entry contains no application path, origin, or port. npm must be
available even when the application uses pnpm, Yarn, or Bun. The adapter version
comes from the initializer; the bridge version follows the application package.

Before changing agent settings, setup starts a fresh MCP client, completes
initialization, and checks that the tools support connection-time selection.
This verifies the executable, not whether an already running agent host has
reloaded it. Fully quit and restart the host after migration.

When testing a local `@nudge-ui/mcp` tarball, pass the same artifact to setup:

```sh
npx nudge-ui agent setup --mcp-package /absolute/path/to/nudge-ui-mcp.tgz
```

This installs the local build for both the application's project bridge and the
reusable adapter. Without the override, the adapter is intentionally resolved
from the published registry and may not contain local changes.

Setup backs up existing `nudge_ui` settings, replaces the global entry, and removes
the current project's overriding entry. Other agent settings are preserved.
Run setup once in other projects that still have legacy overrides; setup does
not scan unrelated repositories. New checkouts need the bridge dependency and
framework integration, but no project-specific MCP registration.

To configure a host manually, use the Node executable and managed adapter entry
printed by setup, with no `--workspace-root` argument. A bare `nudge-mcp` command
also works if that executable is installed independently and available on the
host's PATH.

Run diagnostics from an application:

```sh
npx nudge-ui agent doctor
```

The doctor distinguishes descriptor, reachable, matching-unreachable, invalid,
and incompatible-protocol counts. Failed loopback probes do not prove that a
bridge never registered: a sandbox can block local networking. Retry diagnostics
outside the command sandbox when appropriate. Credentials are never printed.
The output includes the resolved registry path and the workspace/application
scope, even when the registry has no sessions.
The reusable MCP adapter exposes the same diagnostics through `nudge_diagnose`.

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

The adapter lists live local sessions through `nudge_list_sessions`. Supply
`workspaceRoot` on every tool call, including status, Canvas, and release. Use
the absolute checkout root or application directory being edited. The adapter
does not infer a task's project from its process working directory.

For example, the first discovery call is:

```json
{
  "name": "nudge_list_sessions",
  "arguments": {
    "workspaceRoot": "/path/to/nudge-examples"
  }
}
```

Selection is automatic only when the supplied scope contains one live session.
If several applications match, also supply the chosen `sessionId` and repeat
both arguments on subsequent calls. A workspace mismatch never falls back to
the only session elsewhere. Independent selections can run concurrently within
one MCP connection. Each selection stays bound to its application through
restarts; old requests are not replayed. An explicit stale session ID requires
rediscovery before listening again.

Existing configurations with `--workspace-root` remain restricted to that scope
until migrated. Branch names and shared Git metadata never authorize selecting
another checkout.

## OpenCode configuration

The setup integration delegates OpenCode file handling to `add-mcp`. It
preserves the documented V2 shape, `mcp.servers.<name>`, and also preserves the
legacy `mcp.<name>` shape when that is what an existing file uses. Setup tests
both layouts and migrates only the Nudge entry.

OpenCode's CLI does not currently provide a Nudge-specific removal command. To
remove only Nudge's registration, use `add-mcp` and select the scope explicitly:

```sh
npx add-mcp remove nudge_ui --global --agent opencode --yes
npx add-mcp remove nudge_ui --agent opencode --yes
```

Run the first command for the global registration and the second for a project
override. These commands leave other MCP servers in place.

One adapter owns a selected project session until it closes. Other adapters
receive a claimed-session error instead of taking browser work. A heartbeat
allows the bridge to recover a claim after an adapter process is killed. Call
`nudge_release` when the user stops listening so another adapter can claim the
session without restarting the MCP host.

## Request execution and host limitations

Ask the agent to listen to Nudge and implement requests until you ask it to stop.
Keep that turn active while sending changes from the browser. Both `nudge_listen`
and its alias `nudge_connect` return an `implementation_request` with an explicit
execution directive, the prompt, request ID, and supplied workspace and session
scope. Existing `prompt`, revision, and sketch fields remain available.

The agent implements the request using its host's normal approval flow, verifies
the result, reports the outcome through `nudge_report_status`, and opens another
listening call. A successful browser dispatch means the bridge delivered the
request; it does not prove that the agent edited source files.

An MCP tool result continues an active tool call. This adapter cannot start a new
model turn after the host ends the conversation, abandons a background call, or
stops consuming its result. Resuming an idle conversation requires a host-specific
event-to-turn integration or a persistent runner that owns the agent session.
The adapter does not launch another coding agent or bypass host permissions.
These limitations apply to any agent harness using this listening workflow.

Codex defaults to a 60-second MCP tool timeout. For longer waits, add
`tool_timeout_sec = 3600` to the existing `[mcp_servers.nudge_ui]` section of
`~/.codex/config.toml`, preserving its command and arguments. See the
[Codex MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Other hosts have their own tool timeouts and background-call behavior. Increasing
the timeout allows a longer active wait; it does not enable idle-turn wake-up.

After updating the adapter, restart the agent host to reload the executable and
server instructions. For local builds, use the tarball setup override described
above; changing the project bridge alone does not update the managed adapter.

## Legacy coupled mode

Passing `--origin` retains the previous behavior in which the MCP process also
owns its browser bridge:

```sh
pnpm exec nudge-mcp \
  --project-id my-app \
  --origin http://localhost:5173 \
  --workspace-root /path/to/my-app
```

This deprecated mode prints a warning and remains available for custom
integrations during migration. New framework integrations should use the
project-owned bridge.

The agent calls `nudge_listen`, applies the delivered prompt, reports the
result through `nudge_report_status`, and listens again. Canvas tools remain
limited to routes from the paired application origin and agent-owned groups.
