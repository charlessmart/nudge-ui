# ADR-0037: In-page extension inspector

Date: 2026-10-22
Status: Accepted
Supersedes: ADR-0033's iframe editor for the Chrome extension and its
page-surface fallback rule, and the extension permission list from ADR-0033
as amended by ADR-0035, which loses `declarativeNetRequestWithHostAccess`;
the inspector now always runs in the page.

## Context

ADR-0033 opened the iframe editor from the toolbar. It reloaded the tab into a
marked editor document, rewrote framing headers with session rules, and then
booted the application again inside a Canvas frame. This caused three problems:

- **Lost state.** A live document cannot move into a frame, so the reload
  discarded anything not in the URL: component state, form input, scroll
  position, and in-memory sign-in.
- **Slow opening.** A click waited on a series of extension API calls, a full
  server request for a document that was then discarded, the inspector bundle,
  the application booting a second time, a 100 ms poll for the frame's DOM, and
  a second injection of the whole bundle into the frame.
- **Unsupported pages.** Header rules do not apply to responses from a site's
  service worker or a meta CSP. Those pages showed "Can't load Nudge on this
  page" and only offered a reduced inspector. The service-worker check also
  matched workers that never handle navigations.

The page-surface fallback already ran the controller and renderer in the
page's own window, with the page as the only Canvas card, through the same
`CanvasFrame` interface as Canvas cards. It needed no framing, no header
rules, and no reload.

## Decision

The extension always runs the inspector in the page and no longer opens the
iframe editor.

- **Toggle.** A toolbar click runs one script in the page. It toggles a loaded
  inspector, or returns the page URL. The service worker reads the origin's
  storage while that script runs, using the URL that `activeTab` exposes with
  the click. It then injects the storage bridge and the boot globals in
  parallel, followed by the inspector bundle. Nothing reloads the tab.
- **No editor machinery.** The extension drops the session header rules, the
  editor document's policy, the loading cover, tab lifecycle tracking,
  renderer-frame injection, and the `declarativeNetRequestWithHostAccess`
  permission. `nudge-ui/internal/page-inspector` keeps only the page surface;
  the editor and renderer entries are removed.
- **Canvas.** The page is the inspector's only card. Frames, duplicates,
  iterations, the zoomed-out board, and responsive-width cards are
  unavailable. A Canvas session restored from an earlier editor shows the page
  in focus. Element targeting, overlays, comments, sketches, and the design
  panel are the shared Canvas renderer code, so nothing is implemented twice.
- **Floating panel.** The extension floats the panel 8 px from the window
  edges with rounded corners. Dragging its header moves it to the left or right
  edge, with an accent outline showing the side it will snap to. The side is
  one preference for every site, stored in `chrome.storage.local`.
- **Panel placement contract.** nudge-ui has no docking option. Instead, it
  lays out everything beside the panel from three CSS custom properties on its
  shadow host: `--panel-inset`, `--panel-reserve-start`, and
  `--panel-reserve-end`. The defaults reproduce the right-edge panel, so host
  Adapters are unchanged. The extension sets these properties from its own
  adopted stylesheet, which also positions `.panel` and flips `.panel__restore`,
  `.locked-notice`, and the collapse button's icon. Its drag handling targets
  `.panel__header-row` in the `nudge-ui-root` shadow root, and its drop target
  uses nudge-ui's theme variables. Renaming any of these in nudge-ui requires a
  matching extension change.
- **Sketch images.** Sketch thumbnails and the sketch editor draw their image
  blobs onto a canvas instead of loading `blob:` URLs into `<img>`, which the
  page's `img-src` policy can refuse. Capturing a sketch still renders the
  viewport through a `data:` image, so pages whose policy refuses `data:`
  images cannot capture sketches.
- **Tokens.** The inspector mounts before it reads document tokens, so a slow
  cross-origin stylesheet request cannot delay the panel. Tokens apply when
  they arrive.
- **Unchanged.** Storage, sketch storage, system fonts, derived identity, and
  development gating follow ADR-0033 and ADR-0035. Host Adapters keep the
  ADR-0027 iframe editor.

## Consequences

- Opening the inspector keeps the page's state and URL. On a static fixture it
  takes about 125 ms from click to toolbar, compared with about 430 ms for the
  editor shell before the application booted in its frame.
- Pages with a site service worker or a frame-blocking CSP are fully
  inspectable. The "Can't load Nudge on this page" message and its runtime
  configuration field are removed.
- The extension no longer weakens a site's clickjacking protection, and the
  server no longer receives the editor marker.
- The panel overlays one edge of the page. Viewport units, media queries,
  and fixed elements measure the full window, not the visible area.
- The page's own scripts run next to the inspector. Conflicts over focus,
  pointer handlers, or `body` changes are possible.
- Reloading the page closes the inspector until the next click.
