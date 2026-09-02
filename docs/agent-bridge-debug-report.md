# Nudge UI MCP integration debug report

Date: 2026-08-30

Branch: `main` (including the merged `mcp` work)

## Summary

The Nudge MCP implementation and Codex desktop integration are working. The
original fallback state was not caused by a bad port, origin, project ID, MCP
handshake, or browser transport.

The missing step was a long-lived `nudge_listen` tool call in the agent host.
Starting the MCP process only starts the loopback bridge. The browser changes
from **Copy prompt** to **Connect agent** only after an agent is actively
executing `nudge_listen` (or its alias, `nudge_connect`). This is the behavior
defined by ADR-0013.

The current Codex desktop task initially did not expose the `nudge_ui.*` tools
to this conversation, even though the project configuration was enabled and
the MCP child process was running. Once the desktop MCP catalog refreshed, the
tools became callable and this task completed the round trip natively. Codex
CLI and OpenCode 2 had already provided the same protocol-level confirmation.

## What was verified

| Area | Result | Evidence |
| --- | --- | --- |
| Sandbox | Pass | Vite responded on `http://localhost:5173`. |
| Default bridge discovery | Pass | Browser health request to `127.0.0.1:30292` returned HTTP 200 for project `sandbox`. |
| MCP handshake | Pass | `tools/list` returned all nine Nudge tools and the server instructions. |
| Browser pairing | Pass | The inspector changed to **Connect agent**, then to **Send prompt** after pairing. |
| Prompt dispatch | Pass | Codex desktop, OpenCode 2, and Codex CLI received the generated prompt, source location, and change revision. |
| Status reporting | Pass | Codex desktop reported `completed`; earlier OpenCode coverage also verified `working` → `completed` in the browser. |
| Canvas presentation | Pass | OpenCode created an agent-owned three-route Canvas group, and the browser rendered three route cards. |
| Unit and type tests | Pass | Inspector: 1,176 tests; agent protocol: 6 tests; MCP: 17 tests; focused typechecks passed. |
| Browser E2E | Pass | `agent-bridge.dev.spec.ts`: 2 tests passed. |

## Root cause

The browser was polling the correct endpoint. The initial response was
equivalent to:

```json
{
  "projectId": "sandbox",
  "connection": "offline",
  "listenerActive": false,
  "paired": false
}
```

In this protocol, `offline` means “no active MCP listener,” not “the browser
cannot reach the bridge.” The browser client therefore correctly selected its
clipboard fallback.

The project Codex configuration was present and enabled:

```toml
[mcp_servers.nudge_ui]
command = "node"
tool_timeout_sec = 86400
```

However, the configured process is not itself a listener. The host must call
`nudge_listen` and keep that call open. The MCP server instructions already
state this requirement, but it is easy to miss because the bridge can be
running while the UI still looks disconnected.

The desktop app initially had the same host-specific problem: the current
model tool surface contained no `nudge_ui` namespace. After the desktop MCP
catalog refreshed, the native `nudge_ui` tools became callable in this task.
The app server now launches the configured Nudge child process directly, and a
long-lived desktop `nudge_listen` call receives browser prompts successfully.

## End-to-end test performed

1. Started the sandbox and opened the homepage in the browser.
2. Confirmed the initial state was the expected **Copy prompt** fallback.
3. Started the native Codex desktop MCP companion from the project
   `.codex/config.toml` and kept `nudge_listen` active.
4. Claimed the user's existing sandbox tab so the test used the same browser
   page and pairing rather than a duplicate canvas tab.
5. Opened **Page view**, selected the homepage heading, and changed its
   managed runtime `font-size` from `64px` to `68px`.
6. Sent the prompt. The inspector changed to **Agent working…**, and the
   desktop `nudge_listen` call received:

   ```text
   App (src/playground/PlaygroundPage.tsx:169:14) · base
   font-size: 64px → 68px
   ```

7. Reported the request as `completed` and immediately re-armed
   `nudge_listen`. The browser returned to an enabled **Send prompt** state.

The edit was intentionally not written to `src/App.tsx`; it was a live managed
stylesheet edit used to verify the handoff. The temporary OpenCode config and
temporary browser endpoint override were removed afterward. No application
source file was changed by the browser test edit.

## Host-specific findings

### Codex desktop

The active desktop task initially showed the fallback because the `nudge_ui`
tools were not present in its tool catalog. The configured process being
visible in the process list was not sufficient to make the tools callable.
After the catalog refreshed, the task exposed all Nudge tools and the native
MCP child appeared under the Codex app server. The current task now has an
active listener and has completed a browser-to-Codex prompt round trip.

For a reliable desktop workflow, verify both conditions:

1. The server appears as enabled in the MCP settings.
2. The current task can see and call `nudge_listen`.

Changing `.codex/config.toml` or installing a new MCP server may require a
Codex desktop restart or a fresh task before the tool catalog updates. A Vite
dev-server restart is not required for a normal browser refresh or for the
already-running bridge to receive a prompt.

The Codex MCP documentation describes project-local configuration and the
desktop MCP restart flow: [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Codex CLI

The same project configuration worked with a fresh CLI execution. The CLI
started the companion, exposed `nudge_ui.nudge_listen`, and delivered the
browser prompt on the deterministic default port.

This is a useful diagnostic: if `codex exec` can call `nudge_listen` but the
desktop task cannot, the Nudge package and project configuration are healthy;
the remaining issue is desktop tool-catalog refresh or task lifecycle.

### OpenCode 2

OpenCode 2 worked in a standalone run after adding a project-local MCP entry.
Its already-running background service did not immediately show the newly
added project server, while `opencode2 run --standalone` did load it. OpenCode
users therefore need to restart or reload an existing service after changing
MCP configuration.

Only one host should own a project's deterministic bridge port at a time. A
second host needs a separate explicit port and a matching browser endpoint for
parallel testing.

## Test-environment caveat

The restricted command sandbox cannot bind new loopback listeners. Running the
MCP tests there produced `listen EPERM`, and the first direct handshake attempt
failed for the same reason. The host-launched Codex and OpenCode processes were
allowed to bind loopback, and the MCP suite passed when rerun with that access:

```text
4 test files passed
17 tests passed
```

This is an execution-environment restriction, not an application failure.

## Recommended improvements

### Priority 0: make the state understandable

Add a separate browser state for “companion reachable, listener inactive.”
Currently that state is represented as `offline`, which hides the most useful
diagnostic distinction. The primary control could retain clipboard behavior but
show a message such as:

> MCP companion detected. Ask the agent to call `nudge_listen`.

Keep “bridge unreachable,” “waiting for listener,” “available,” and “paired” as
separate states in the UI and diagnostics.

### Priority 1: add a host diagnostic command

Provide a small `nudge-mcp doctor` or equivalent that checks:

- project ID and workspace root;
- deterministic bridge port availability;
- origin allow-list behavior;
- MCP initialization and `tools/list`;
- whether a listener call is active; and
- whether the browser can pair.

This would reduce debugging to one copyable command instead of requiring
process inspection and browser network tracing.

### Priority 1: test host lifecycle explicitly

Add smoke tests for each supported host that verify all of the following:

1. project configuration is loaded;
2. the Nudge tools appear in the host catalog;
3. `nudge_listen` remains active for a long-running call;
4. a browser prompt resumes that call; and
5. a fresh host/task is required after configuration changes when the host
   caches its MCP catalog.

The existing browser E2E test proves the Nudge protocol, but it cannot detect a
host that silently omits the server from its model tool surface.

### Priority 2: improve installation guidance

Make the post-install output explicitly say:

> MCP registration complete. Start your agent, then ask it to call
> `nudge_listen` and leave that call active.

Document the equivalent setup for OpenCode 2 and other stdio MCP hosts. Treat
“configured” and “listening” as different setup milestones.

### Priority 2: add a recovery action

Give the inspector a “Retry agent discovery” action and expose the last health
result, detected project ID, endpoint, and listener state in a dev-only
diagnostics popover. This is especially useful after an agent host restarts or
switches between Codex and OpenCode.

## Follow-up changes applied

This investigation also applied the low-risk improvements that do not change
the bridge protocol:

- The root and package READMEs now distinguish MCP registration from an active
  `nudge_listen` call and document host reload/restart behavior.
- Package installation now reports that Codex must reload the MCP server and
  that the agent must call `nudge_listen`.
- MCP initialization and `nudge_listen` descriptions tell agents to start the
  listener immediately at task start.
- The inspector now distinguishes a reachable companion with no active listener
  from an unreachable bridge and displays the recovery instruction inline.

The remaining optional improvement is a fuller diagnostics/recovery surface,
including a retry action and the last health response.

## Final state

- No dev server was forcibly stopped.
- The sandbox is restored to its normal bridge configuration.
- Temporary OpenCode and HTML endpoint changes were removed.
- No application source file was changed by the test edit; the intentional
  documentation, installation-message, MCP-instruction, and inspector hint
  updates are present in the working tree.
- The Nudge browser bridge, MCP server, and native Codex desktop host have been
  verified end to end.
- The browser is paired to the Codex desktop companion, and a Codex desktop
  `nudge_listen` session is currently left active on the default bridge port.
- No Nudge MCP implementation change was required for this successful path.
