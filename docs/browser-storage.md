# Browser storage and session data

Nudge UI's inspector runs in development builds and uses origin-scoped
`localStorage` for local editing state. `localStorage` is
readable by any script running on the same origin; it is not an encrypted
credential store. Do not use the inspector on pages that contain sensitive data
or untrusted scripts.

## Stored keys

| Key | Contents | Lifetime |
| --- | --- | --- |
| `nudge-ui:<project-id>:v17` | Current Canvas and inspector state, including cards, camera state, canvas mode and presentation, the focused frame, and clipboard handoff fingerprints. It contains no change records; pending edits live in the draft store (`nudge-ui-drafts:<project-id>:v2`). Only this schema is read; older versioned keys are not migrated. | Until the session is cleared or site data is removed. |
| `nudge-ui-drafts:<project-id>:v2` | Pending draft edits — ordinary and structural changes, and each draft's revision — for drafts with pending changes only. Only this schema is read; older versioned keys are not migrated. | Until the session is cleared or site data is removed. |
| `nudge-ui:<project-id>:lease` | The current workspace owner ID and heartbeat timestamps. | The lease expires after 15 seconds without a heartbeat and is removed when released. |
| `nudge-ui:<project-id>:prompt-settings` | Custom instructions used when generating prompts. | Until overwritten or site data is removed. |

Sketches are stored separately from `localStorage`. The tick button in the sketch bar copies the
sketch image to the clipboard and keeps the three most recent ones, so a copy can be
copied again if it was never pasted. Those copies (the marked-up page images) live in
IndexedDB under `nudge-ui-sketches`, in extension storage when running as the
browser extension, and in memory only in demo builds. A fourth copy replaces the
oldest.

The **Open app** action also sets `nudge-ui:direct-tab` in `sessionStorage`.
This tab-scoped flag keeps application navigation and reloads outside the editor
after the initial bypass URL marker is gone. It lasts until the tab closes or
the key is removed. Explicit editor URLs and renderer frames still enter their
assigned roles.

## Clear stored data

Use the inspector's session-clear control to remove durable editing state. To
clear a project's records manually from that project's origin, run:

```js
const projectId = "my-app";

localStorage.removeItem(`nudge-ui:${projectId}:v17`);
localStorage.removeItem(`nudge-ui-drafts:${projectId}:v2`);
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
