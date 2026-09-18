# Browser storage and session data

Nudge UI's inspector runs in development builds and uses origin-scoped
`localStorage` for local editing state and MCP pairing state. `localStorage` is
readable by any script running on the same origin; it is not an encrypted
credential store. Do not use the inspector on pages that contain sensitive data
or untrusted scripts.

## Stored keys

| Key | Contents | Lifetime |
| --- | --- | --- |
| `nudge-ui-agent-session:<encoded-project-id>` | The project ID, origin, and bearer session token used to restore an MCP pairing. | Until disconnect, token invalidation, or site-data clearing. There is no browser-side expiry. |
| `nudge-ui-agent-auto-connect-disabled:<encoded-project-id>` | Whether the user explicitly disconnected a project-managed bridge. | Until an explicit connection or site-data clearing. Prevents automatic pairing after reload. |
| `nudge-ui:<project-id>:v12` | Current Canvas and inspector state, including same-origin routes, card metadata, camera state, recorded changes, structural changes, bounded rendered evidence, and clipboard handoff fingerprints. Only this schema is read; older versioned keys are not migrated. | Until the session is cleared or site data is removed. |
| `nudge-ui:<project-id>:lease` | The current workspace owner ID and heartbeat timestamps. | The lease expires after 15 seconds without a heartbeat and is removed when released. |
| `nudge-ui:<project-id>:prompt-settings` | Custom instructions used when generating prompts. | Until overwritten or site data is removed. |

The **Open app** action also sets `nudge-ui:direct-tab` in `sessionStorage`.
This tab-scoped flag keeps application navigation and reloads outside the editor
after the initial bypass URL marker is gone. It lasts until the tab closes or
the key is removed. Explicit editor URLs and renderer frames still enter their
assigned roles.

The browser sends the MCP session token in query parameters for the bridge's
`/status` and `/events` endpoints. The companion is loopback-only by default,
but URLs can still appear in browser tooling or local proxy and server logs.
Treat the token as a bearer credential and do not share those URLs. Other
authenticated operations send the token in a request body.

The companion keeps its active pairing in memory. The browser token remains
until the user disconnects, the companion rejects it, or the origin's storage
is cleared. Storage is best effort; browser privacy settings can disable it
without preventing the in-memory session from working.

Project-managed bridges also write local discovery records under the operating
system account's `~/.cache/nudge-ui/sessions` directory. Each record contains
workspace and application paths, runtime metadata, and an adapter control token;
it does not contain prompts. Records are private to the account and removed on
orderly bridge shutdown. Discovery ignores stale records left by terminated
processes. Control tokens are never included in browser manifests or MCP session
listings.

## Clear stored data

Disconnect the agent from the inspector to revoke and remove the pairing token.
Use the inspector's session-clear control to remove durable editing state. To
clear a project's records manually from that project's origin, run:

```js
const projectId = "my-app";

localStorage.removeItem(`nudge-ui-agent-session:${encodeURIComponent(projectId)}`);
localStorage.removeItem(`nudge-ui-agent-auto-connect-disabled:${encodeURIComponent(projectId)}`);
localStorage.removeItem(`nudge-ui:${projectId}:v12`);
localStorage.removeItem(`nudge-ui:${projectId}:lease`);
localStorage.removeItem(`nudge-ui:${projectId}:prompt-settings`);
```

The inspector validates the schema identifier and every current durable record
before restoring a session. If the current key contains malformed data or an
unsupported schema version, the inspector discards that session and starts
empty. Older versioned keys are ignored rather than migrated or cleaned up.
Incompatible upgrades therefore lose the stored session; reverting the code
does not recover data that was discarded.

Avoid `localStorage.clear()` unless you intend to remove storage belonging to
the host application as well.
