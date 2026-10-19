# ADR-0035: System fonts in the font family list

Date: 2026-10-19
Status: Accepted
Supersedes: ADR-0033's list of extension permissions, which adds `fontSettings`

## Context

The font family field lists only the project's tokens. To try a font that
is not a token, a developer has to know its exact family name and type it.

Pages cannot enumerate installed fonts without asking. Chromium's Local Font
Access API, `window.queryLocalFonts()`, needs a secure context and the
`local-fonts` permission. Chrome asks for that permission once per origin,
and only during a user gesture. Firefox and Safari do not implement the API.

In the extension, the inspector runs in the inspected site's main world, so
a Local Font Access prompt would name the site rather than Nudge. Granting it
would also let the site list fonts later, after the editor closes. Extension
service workers can call `chrome.fontSettings.getFontList()` without a
prompt, and the `fontSettings` permission shows no install warning.

## Decision

The font family list shows installed font families after the project's tokens,
under a **System fonts** label. Choosing a family commits its name as a raw
value. A name that is a single CSS identifier is written bare, and every other
name is quoted. An untouched field lists every family, and typing filters the
list. The token chip picker offers the same families, and choosing one
detaches the token. Hidden macOS families, whose names start with `.`, are
omitted.

Highlighting a family or font token with the pointer or arrow keys previews it
on the selected elements. The preview is an `!important` rule in an owned
stylesheet, matched through a `data-nudge-ui-value-preview` attribute.
Inspection ignores both the rule and the attribute, so fields keep showing the
authored value. Moving the pointer off the list, filtering the highlighted
item away, or closing the list removes the preview. The automatic highlight on the first item does
not trigger a preview. Only choosing an item records an edit. The list loads once per inspector session and is shared by every font
family field.

A font source reports access as `granted`, `prompt`, `denied`, or
`unavailable`, and lists family names:

- **Host Adapters** use the Local Font Access API in the editor document. With
  access granted, the list loads when a font family list opens. With access
  set to prompt, the list shows a **Show system fonts** row. Choosing that row
  calls `queryLocalFonts()` within the user gesture, so Chrome asks. When
  access is denied or the API is missing, the list shows no system fonts.
- **The extension** adds the `fontSettings` permission. The service worker
  answers a bridge message with `chrome.fontSettings.getFontList()` and returns
  each font's `fontId`, which is the family name CSS matches. The isolated-world
  bridge relays the list to the main world through request and response DOM
  events. The inspected site's scripts share the main world, so the list is
  gated on gestures the page cannot forge:
  - The bridge sees the same DOM events as the inspector, and only the user
    produces trusted events. It answers a request only while it is handling a
    trusted click or key press inside the inspector's root.
  - The list shows the same **Show system fonts** row. A trusted click on that
    row, or Enter while it is highlighted, marks the request as the user's
    consent. The service worker then records `system-fonts:<origin>` for the
    sender's origin in `chrome.storage.local`. The bridge writes `site:` keys
    for the page, so consent never uses them.
  - Without that record, the service worker refuses every other request. At
    injection it passes the record to the inspector, so later sessions on the
    site load the list when a font family list opens.

`nudge-ui/internal/page-inspector` accepts the source as `systemFonts`,
following ADR-0025.

## Consequences

- The extension still installs without a permission warning. Adding a
  permission without a warning does not disable existing installations when
  they update.
- Until the user asks on a site, its scripts cannot obtain the family names.
  Afterwards, they can observe the list when the inspector loads it, and they
  can request it while the user clicks or types in Nudge UI. The bridge stops
  answering when the inspected document unloads.
- Consent has no per-site revoke control; removing the extension or clearing
  its storage revokes it.
- A failed or refused request offers the row again, unless the source reports
  that access is denied or unavailable.
- In host Adapters, Chrome stores the permission for the development origin,
  and the application's own scripts can list fonts on that origin too.
- Browsers without the Local Font Access API, and development servers reached
  over plain HTTP on a LAN address, show no system fonts in host Adapters.
- A chosen system font might not be installed on other machines. The value is
  written without a fallback stack, as typed family names are.
- Every matching family renders as a row with a sample in its own font.
  Samples outside the visible list skip layout, so opening the list loads only
  the fonts in view. Chrome's first `queryLocalFonts()` call on a device with
  many fonts can take about a second; the list shows a loading row meanwhile.
- Fonts installed while the inspector runs appear after a reload.
