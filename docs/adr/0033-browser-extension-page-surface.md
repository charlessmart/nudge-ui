# ADR-0033: Browser extension page surface

Date: 2026-10-09
Status: Accepted
Supersedes: ADR-0027's single iframe workspace, and ADR-0006's rule that a renderer never mounts an inspector, for the browser extension only.

## Context

The iframe editor from ADR-0027 needs a host Adapter to serve the editor
document and to instrument the application. It cannot inspect a page the
developer does not build locally. Arbitrary sites also refuse framing through
`X-Frame-Options` and `frame-ancestors`, and a cross-origin frame hides its
document from the controller.

A bookmarklet spike loaded the inspector into the inspected page. Page
`script-src` policies blocked it on many sites, and it could only store data in
the site's own `localStorage`. Its iframe editor mode framed the page from
another document and hit the same framing limits.

## Decision

Ship a Chrome Manifest V3 extension, `@nudge-ui/chrome-extension`, that loads
the inspector into the current tab. Remove the bookmarklet distribution and its
iframe editor mode.

- **Injection.** The toolbar action uses `activeTab` and `scripting`. The
  extension has no host permissions and no content scripts. The first click
  injects the inspector into the page's main world; later clicks toggle it.
  Turning it off unmounts the inspector, removes its listeners, and releases
  the workspace lease.
- **Package boundary.** `nudge-ui` exports the entry as the internal subpath
  `nudge-ui/internal/page-inspector`, following ADR-0025. The extension bundles
  the built package; it does not import inspector source.
- **Page surface.** The controller and the renderer run in the inspected window.
  The page is the only Canvas card. Controller code reads every card through
  the structural `CanvasFrame` interface: Canvas cards pass their iframe, and
  the page surface passes the window. Element-only behavior, such as load
  listeners, resize observation, and visibility checks, applies only to
  iframes. The panel overlays the page, and the page does not reflow.
- **Derived identity.** The project ID is `page:<origin>`. Runtime identity is
  assigned lazily under the pointer, and tokens come from readable stylesheets
  and root custom properties. Source locations, component semantics, HTML
  iterations, and the agent bridge are unavailable. As in ADR-0032, no endpoint
  is published, so the page has no agent connection; output is the copied
  prompt.
- **Storage.** Comments, drafts, the canvas session, and prompt settings are
  stored in `chrome.storage.local` under `site:<origin>|<key>`. Before
  injection, the service worker reads the tab origin's keys and passes them to
  the inspector as a synchronous mirror. Writes go through a DOM event to an
  isolated-world bridge, which prefixes keys with its own origin, so a page
  cannot write another origin's data. The workspace lease stays in
  `localStorage` because it coordinates tabs on one origin. Sketch images stay
  in the page origin's IndexedDB.
- **Content Security Policy.** Extension-injected scripts are not subject to
  page `script-src`. The inspector uses constructable stylesheets and does not
  probe for `<style>` support, which would report a violation to the site. The
  rule collector reads adopted stylesheets, so managed previews remain
  inspectable. Cursor images are web-accessible extension resources served with
  `use_dynamic_url`; page `img-src` does not govern them. The empty-state
  illustration is inline SVG.
- **Development gating.** The extension bundle is built with development
  behavior enabled. Application production builds are unchanged, and ADR-0002
  still applies to them.

The iframe editor remains the workspace for projects that use a host Adapter.

## Consequences

- Any page that allows extension injection can be inspected without a local
  host Adapter. Chrome Web Store pages, `chrome://` URLs, and other restricted
  pages show an error badge instead.
- The extension requires Chrome 130 or later for `chrome.storage.local.getKeys`.
- Cross-origin stylesheets without CORS remain unreadable through the CSSOM, so
  their rules and tokens are missing from inspection.
- Fixed and viewport-relative layout includes the panel, because the page shares
  the inspector's viewport.
- Comment pins re-anchor only after their element receives identity, which
  happens when the pointer moves over it.
- Changes to a page's own adopted stylesheets do not invalidate inspection.
- The comment cursor uses default theme colors, because its image is generated
  at build time.
- Web-accessible resources let pages detect an installed extension.
  `use_dynamic_url` changes their URL each session, which makes this harder.
