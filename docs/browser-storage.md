# Browser storage

Nudge UI uses the page's origin-scoped `localStorage` only for development
convenience. It does not use `sessionStorage` for its runtime state, and it
does not write application source files.

## Keys

The runtime writes these key families:

| Key pattern | Contents | Lifetime |
| --- | --- | --- |
| `nudge-ui:<project-id>:v10` | The durable inspector session: mode, current URL, Canvas cards and camera, comparison groups, CSS/token/component/text changes, and structural changes. | Persists across reloads and browser restarts until the user clears it. Older `v3`–`v9` entries may be read once and upgraded. |
| `nudge-ui:<project-id>:lease` | A short-lived workspace lease: project ID, random tab owner ID, and acquisition/heartbeat timestamps. | Shared by same-origin tabs; expires after the heartbeat stops. It contains no edit content. |
| `nudge-ui-agent-session:<encoded-project-id>` | The local companion pairing record: project ID, page origin, and the pairing session token. | Persists so a reload can restore pairing; removed by disconnect, a failed/stale restore, or manual clearing. |

The `<project-id>` is supplied by the host adapter. A Vite project can set an
explicit `projectId`; otherwise the adapter uses its project-root name. Next.js
and standalone HTML derive a deterministic ID from the canonical project root.
The key is scoped by this ID, not by a browser-wide global. Two projects that
use the same origin and the same project ID share a session, so give embedded
or otherwise colliding projects explicit IDs.

`localStorage` is scoped to an origin and browser profile. Tabs for the same
origin can see the same keys; another origin cannot. The durable session has no
time-based expiry. Navigating to another route keeps the durable edits and
adopts the new same-origin route on hydration.

## What the durable session can contain

Nudge serializes the data needed to restore a preview, including:

- source-relative file names, line/column positions, selectors, token names and
  CSS values;
- before/after CSS, token, component-prop, and rendered-text values;
- bounded rendered evidence such as visible text, serialized props, accessible
  labels, and component names;
- same-origin URLs and titles for Canvas cards and comparison routes; and
- structural edit references, Canvas layout, and the current inspection mode.

This data is intended for local development, but it may still be sensitive.
For example, an edited or rendered value can contain user-entered copy, a URL
with a query token, a component prop with private data, or a CSS value with a
URL. Relative source paths can also reveal repository structure. The pairing
session token is a local companion credential and should be treated as
sensitive. Do not use Nudge UI with production data or secrets in a shared
browser profile, and do not put secrets into values that you plan to copy or
send in an agent prompt.

Nudge UI does not send the contents of these keys to a hosted analytics
service. If the user copies a prompt or dispatches it to the local companion,
the selected change data can of course appear in that prompt and in the normal
agent workflow.

## Clear stored data

Use **Clear Changes** in the inspector to remove the current project’s durable
session (including supported legacy versions) and reset its previews and Canvas
state. This does not remove the workspace lease or a saved agent pairing.

To remove every Nudge UI key from the current origin without deleting unrelated
application storage, run this in that page’s DevTools console:

```js
for (const key of Object.keys(localStorage)) {
  if (key.startsWith("nudge-ui:") || key.startsWith("nudge-ui-agent-session:")) {
    localStorage.removeItem(key);
  }
}
```

This clears all project sessions, leases, and pairing records for the current
origin. Browser site-data controls can also clear the origin’s storage. Avoid
`localStorage.clear()` unless removing the application’s unrelated storage is
intentional.
