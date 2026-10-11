# ADR-0033: Browser extension editor

Date: 2026-10-10
Status: Accepted
Supersedes: ADR-0006's rule that a renderer never mounts an inspector, for the browser extension's page-surface fallback only.

## Context

The iframe editor from ADR-0027 needs a host Adapter to serve the editor
document and to instrument the application. It cannot inspect a page the
developer does not build locally. Arbitrary sites also refuse framing through
`X-Frame-Options` and `frame-ancestors`, and a cross-origin frame hides its
document from the controller.

A bookmarklet spike loaded the inspector into the inspected page. Page
`script-src` policies blocked it on many sites, and it could only store data in
the site's own `localStorage`. Its iframe editor mode kept the page's own
scripts running behind the editor, and sites that refuse framing fell back to
a panel that covered the page.

## Decision

Ship a Chrome Manifest V3 extension, `@nudge-ui/chrome-extension`, that opens
the ADR-0027 iframe editor on the current tab. Remove the bookmarklet
distribution.

- **Permissions.** The extension uses `activeTab`, `scripting`, `storage`, and
  `declarativeNetRequestWithHostAccess`. It has no host permissions and no
  content scripts, so installation shows no permission warning. Header rules
  apply only to the origin that the toolbar click grants through `activeTab`.
- **Opening the editor.** The toolbar click adds two session rules scoped to the
  tab, then reloads it with the `nudge-ui=editor` marker:
  - Responses for the tab's same-origin frames lose `X-Frame-Options` and
    `Content-Security-Policy`, so the application can be framed.
  - The marked top-level response gets a policy that blocks scripts, images,
    media, fonts, objects, and external stylesheets, and allows only
    same-origin frames. The application's scripts run only in renderer
    frames, and the discarded page loads no assets. Inline styles stay allowed
    for the inspector's own UI.

  The service worker then injects the inspector into the editor document. The
  editor replaces the page content and frames the unmarked URL. When a
  renderer frame's document is parsed, the editor asks the service worker,
  through the isolated-world bridge, to inject the bundle into frames that do
  not yet run it. The bundle starts a renderer only in Canvas renderer frames.
  Reloading the editor restarts it. A second click, or the
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> shortcut, loads the unmarked
  URL and removes the rules.
- **Page-surface fallback.** If a redirect drops the marker, the page runs
  normally and the inspector runs inside it. The controller and the renderer
  share the window, and the page is the only Canvas card. Controller code reads
  every card through the structural `CanvasFrame` interface: Canvas cards pass
  their iframe, and the page surface passes the window.
- **Package boundary.** `nudge-ui` exports the entry as the internal subpath
  `nudge-ui/internal/page-inspector`, following ADR-0025. The extension bundles
  the built package; it does not import inspector source.
- **Derived identity.** The project ID is `page:<origin>`. Runtime identity is
  assigned lazily under the pointer. Tokens come from readable stylesheets and
  root custom properties, collected from the renderer frame because the editor
  document runs no application scripts. Prompts locate elements by DOM path,
  because source locations are unavailable. Component semantics,
  HTML iterations, and the agent bridge are unavailable. As in ADR-0032, no
  endpoint is published, so the page has no agent connection; output is the
  copied prompt.
- **Storage.** Comments, drafts, the canvas session, and prompt settings are
  stored in `chrome.storage.local` under `site:<origin>|<key>`. Before
  injection, the service worker reads the tab origin's keys and passes them to
  the inspector as a synchronous mirror. Writes go through a DOM event to an
  isolated-world bridge, which prefixes keys with its own origin, so a page
  cannot write another origin's data. The workspace lease stays in
  `localStorage` because it coordinates tabs on one origin.
- **Sketch storage.** Sketches are stored in `chrome.storage.local` under
  `sketch:<origin>|doc:<id>` and `sketch:<origin>|handoff:<id>`, so the
  inspected site's IndexedDB is never written. The inspector reads and writes
  them on demand through request and response DOM events. The isolated-world
  bridge applies the origin prefix, as it does for inspector storage. The
  service worker doesn't read sketch keys before injection, because they hold
  screenshots. Images are stored as base64, because `chrome.storage` holds only
  JSON values.
- **Content Security Policy.** Extension-injected scripts are not subject to
  page `script-src`. The inspector uses constructable stylesheets and does not
  probe for `<style>` support, which would report a violation to the site. The
  rule collector reads adopted stylesheets, so managed previews remain
  inspectable. Cursor images are web-accessible extension resources served with
  `use_dynamic_url`; page `img-src`, including the editor document's, does not
  govern them. The empty-state
  illustration is inline SVG.
- **Development gating.** The extension bundle is built with development
  behavior enabled. Application production builds are unchanged, and ADR-0002
  still applies to them.

## Consequences

- Any page that allows extension injection can be inspected without a local
  host Adapter, with the same editor, Focus, and Canvas as host Adapters.
  Chrome Web Store pages, `chrome://` URLs, and other restricted pages show an
  error badge instead.
- Opening the editor reloads the page, and the server receives the marker query
  parameter. The editor document's blocked application scripts appear as CSP
  errors in its console.
- Removing framing headers weakens the site's clickjacking protection for its
  own origin within that tab until the editor closes.
- Frames that redirect to another origin keep their framing headers and do not
  load.
- The extension requires Chrome 130 or later for `chrome.storage.local.getKeys`.
- Sketches share the 10 MB `chrome.storage.local` quota with inspector state,
  because the extension doesn't request `unlimitedStorage`. Base64 encoding
  increases image size by about a third. The limit of four kept sketches keeps
  typical usage within the quota.
- Cross-origin stylesheets without CORS remain unreadable through the CSSOM, so
  their rules and tokens are missing from inspection.
- Comment pins re-anchor only after their element receives identity, which
  happens when the pointer moves over it.
- Changes to a page's own adopted stylesheets do not invalidate inspection.
- The comment cursor uses default theme colors, because its image is generated
  at build time.
- Web-accessible resources let pages detect an installed extension.
  `use_dynamic_url` changes their URL each session, which makes this harder.
