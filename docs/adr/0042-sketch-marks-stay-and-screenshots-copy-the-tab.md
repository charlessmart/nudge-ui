# ADR-0042: Sketch marks stay on the page, and screenshots copy the tab

Date: 2026-10-27
Status: Accepted
Supersedes: ADR-0040 in full, and ADR-0041's per-save capture, kept tab
stream, canvas zoom-to-card, and DOM-capture fallback.

## Context

Saving a sketch captured one frame, drew the marks onto it, copied it, stored
it, and wiped the marks. That made every note a one-shot: marks could not stay
while the user kept working, and a sketch could cover only one canvas frame.
Storing copies also filled the extension's 10 MB `chrome.storage` quota, since
each PNG took about 2.7 MB once encoded and the new copy was written before the
oldest was removed. The DOM capture that Safari and Firefox relied on kept
drifting from what the user saw (ADR-0041).

## Decision

- **Marks are page state, not saved images.** The marks store keeps one edit
  history per frame and page, keyed by card ID and the frame's URL without its
  hash. Marks last as long as the page that hosts the inspector, stay on screen
  after the sketch tool closes, and never take a click. They are drawn inside
  each canvas card (so they follow the board's pan and zoom) or over the page
  on the page surface.
- **Any frame can be drawn on.** A press on any frame draws on that frame;
  nothing locks the sketch to the first one. Undo and redo act on the frame
  being drawn on, and only while the sketch tool is open.
- **Clear all** removes every frame's marks. Each frame can undo its own clear.
- **Screenshot** replaces Save. It copies the tab, minus the open panel, with
  Nudge UI's controls hidden and the marks left in. The marks are in the
  browser's pixels, so nothing is redrawn. Nothing is stored, and marks are not
  cleared.
  - **Extension:** `chrome.tabs.captureVisibleTab`, under ADR-0041's gesture
    rule; the crop follows from the window's size.
  - **Host Adapters:** each screenshot asks the browser to share the screen and
    stops the share as soon as the picture is taken. Chromium is asked for this
    tab. Safari and Firefox can share only a window or a screen, so four
    magenta squares are drawn at the corners of the page area, found in the
    shared picture, and removed; the first frame without them is cropped to
    where they were. A match must have the page's shape and solid squares in
    all four corners.
- **No DOM capture.** If a screenshot fails, the user is told why and can try
  again. `modern-screenshot` is removed.
- **No sketch storage.** The IndexedDB sketch database, the extension's sketch
  channel and its `sketch:` keys, and the recent-sketches tray are removed.
  Existing stored sketches are left as they are; there are no users to migrate.

## Consequences

- Host Adapters show the browser's sharing prompt on every screenshot, and in
  Safari and Firefox the user must pick a window or screen where the page is
  fully visible. The sharing indicator shows only while the picture is taken.
- The corner squares flash for a frame or two, and a covered corner or an
  off-screen window makes the screenshot fail rather than come out wrong.
- Marks drawn on a page that later reflows (a resized card, changed content)
  stay where they were drawn and may no longer line up.
- Marks are lost on a reload of the hosting page.
- The extension stores nothing per sketch, so it no longer approaches its
  storage quota.
