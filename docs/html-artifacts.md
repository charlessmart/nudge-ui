# Agent-authored HTML artifacts

Nudge indexes `.nudge/artifacts` whenever the **Add page** menu opens. An agent
can write standalone HTML prototypes directly into that folder; no MCP server,
HTTP request, or API call is involved.

## Directory layout

Create one directory per prototype, named with a UUID:

```text
.nudge/artifacts/<uuid>/
  document.html
  preview.html
  baseline.html
  metadata.json
```

| File | Purpose |
| --- | --- |
| `document.html` | The editable source. Nudge writes visual edits back here. |
| `preview.html` | The rendered base Nudge loads in the Canvas frame. |
| `baseline.html` | The untouched original capture. Nudge leaves it unchanged when saving visual edits. |

Start with the same complete HTML document in all three files. The HTML must be
self-contained: inline CSS, JavaScript, fonts, and images. Nudge serves only the
HTML file from this directory, so separate asset files will not load.

## `metadata.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sourceUrl": "http://localhost:3000/pricing",
  "title": "Pricing alternatives",
  "capturedAt": 1760000000000,
  "viewport": { "width": 1440, "height": 900 }
}
```

- `id` must exactly match the directory name and be a 36-character UUID.
- `sourceUrl` must be the same-origin application route the prototype is for.
  It provides provenance and the route used by **Copy prompt for live app**; it
  does not register a route in the application.
- `title` is shown in the artifact list.
- `capturedAt` is the current Unix timestamp in milliseconds.
- `viewport` becomes the frame size when the artifact is opened in Nudge.

Nudge ignores directories with missing or invalid metadata.

## Workflow

1. Generate a UUID, for example with `crypto.randomUUID()`.
2. Create `.nudge/artifacts/<uuid>/` and write the four files above.
3. Open **Add page → HTML iterations** in Nudge. If the menu is already open,
   close and reopen it so Nudge rescans the directory.
4. Choose the prototype to add it to the Canvas at its recorded viewport size.

`.nudge` is local and gitignored. Nudge lists the newest 200 valid artifacts.
Removing the last Canvas frame that uses an artifact deletes it; there is no
archive, so move or copy anything you want to keep outside Nudge.

The **Add page** menu has a **Copy agent instructions** action that copies a
self-contained version of these rules for pasting into a coding agent.

## Notes for agents

- Create new prototypes rather than editing the application source.
- Use a separate UUID directory for every prototype.
- Keep the HTML standalone; external relative assets are not served.
- Do not add the revision marker attribute; Nudge adds it when serving the
  artifact.
- `sourceUrl` should point at an existing same-origin application route, even
  when the prototype is for a page that is still only a design.
