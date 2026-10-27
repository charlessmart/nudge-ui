# ADR-0041: Sketch screenshots come from the browser

Date: 2026-10-27
Status: Accepted
Supersedes: ADR-0037's sketch-image note that capturing a sketch renders the
viewport through a `data:` image.

## Context

A sketch is a copied PNG of the page with the user's marks on it (ADR-0040).
The page image was rebuilt from the DOM with `modern-screenshot`, which needs
no permission but reproduces the page only as well as computed styles describe
it. Real pages kept exposing the gap: a design system's custom properties
copied onto every node made a long page serialize to hundreds of megabytes and
render blank; a transform used to fake scrolling broke fixed and sticky
elements; slow cross-origin images came out empty; and Chrome can report an
auto margin as `0px`, which moved a centred column to the left edge. The marks
then point at the wrong pixels, which is the one thing a sketch must not do.

## Decision

- Sketch capture asks a `TabCaptureSource` for real pixels of the visible tab
  first. It hides the inspector with `visibility` (the sketched frame and the
  open panel opt back in), waits for a paint, captures, crops to the sketched
  viewport, and scales into `SKETCH_LIMITS`.
- **Extension.** The service worker calls `chrome.tabs.captureVisibleTab`
  through the isolated-world bridge. `activeTab` covers it: the inspector runs
  only after the user invokes the extension on the tab, and a full navigation
  removes both. No permission is added. Because a screenshot shows
  cross-origin frames the page cannot read, the bridge serves a capture only
  within ten seconds of a trusted click or key press inside Nudge UI, and only
  one per gesture.
- **Host Adapters in Chromium.** The first save asks the user to share the
  current tab (`getDisplayMedia` with `preferCurrentTab`). The stream stays
  open while the sketch tool is open and closes with it. A capture handle
  confirms the stream shows this tab; a different tab or a window is refused.
  A declined prompt is not asked again until the sketch tool reopens.
- **Canvas.** Before a browser capture, a card that is partly off screen or
  shown below full size is zoomed to fill the board area beside the panel. The
  camera stays there afterwards.
- **Fallback.** Safari and Firefox can share only a window or a screen, so
  they have no source. They, and any failed or refused browser capture, use the
  DOM capture. It now clones only what the viewport shows, drops custom
  properties, offsets the root instead of transforming `<body>`, and gives
  images their own download budget.

## Consequences

- In Chromium and the extension, a sketch shows exactly what the user saw,
  including canvas, WebGL, cross-origin images, and video.
- Host Adapters show Chrome's tab-sharing prompt once per sketch session and
  its sharing indicator while the sketch tool is open.
- The inspector disappears for about two frames on each save, and a canvas
  card may move under the user's view.
- The DOM capture remains for Safari and Firefox with its known fidelity gaps.
  Its `data:` image restriction from ADR-0037 now applies only there.
- Storage and the sketch record format from ADR-0040 are unchanged.
