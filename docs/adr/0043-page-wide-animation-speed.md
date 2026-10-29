# ADR-0043: The Inspection tool slows the whole page

Date: 2026-10-28
Status: Accepted
Supersedes: ADR-0039's controller-owned animation timeline and its animation
markers, and its one-view-at-a-time view tool. Outline view, Explode view and
the renderer-owned view state stand.

## Context

The Animation tool found animations one element at a time. The renderer
scanned every stylesheet for transitions and keyframes and pinned a marker on
up to 150 elements; the controller scanned the selection again, forced its
hover state, and captured whatever started so a timeline could scrub it. On
real sites this surfaced every small hover transition as a marker, cost a
stylesheet walk and a rescan on every page change, and only ever reached CSS
and Web Animations. The question the tool exists to answer — why does this
motion look janky — needs the motion to run slowly while the user triggers it
the way the app does, whatever drives it.

## Decision

- **One Inspection tool.** A single toolbar tool replaces the view tool that
  showed Animation, Outline view or Explode view one at a time. While it is
  active a panel above the toolbar, on the toolbar's own layer, holds the
  speed slider, Spacing and Outlines switches, and an Explode button, which
  apply together and on top of the slowed speed. D picks the tool; O and X
  switch their views, bringing the tool up if it is away. Spacing and Outlines
  are remembered while the tool is put away; Explode is switched off and the
  speed set back to 1×, so the tool opens again from a clean start.
- **Selection carries on under the overlays.** With Spacing or Outlines on and
  Explode off, clicks select elements as the design tool's do; otherwise the
  app keeps the pointer, so the user can trigger the motion being slowed.
- **Spacing is drawn in the page.** The renderer fills each visible element's
  margin, padding and flex or grid gaps on a fixed SVG layer. While a subtree is
  exploded, its spacing is measured flat before the layers move and drawn on
  one plane per depth, on a stage that follows the exploded root's live 3D
  transform.
- **One speed for the whole page.** The speed slider runs from 0.1× to 1× and
  stops at every tenth. `debug-view-state` carries `animationSpeed` in place
  of the marker flag; it is 1 unless the Inspection tool is active, so putting
  the tool away returns the page to real time.
- **Each kind of motion is slowed through the one clock it reads**, so none is
  slowed twice:
  - CSS animations, CSS transitions and `element.animate()` run on the
    document timeline. The renderer scales each one's playback rate from its
    own. A CSS animation announces nothing until its delay has run, which
    would leave staggered delays at full speed, so anything that can restyle
    the page (a DOM mutation, a pointer, focus or input event, a resize)
    schedules one sweep of `document.getAnimations()` on the next frame; its
    style flush creates the new animations before they start. A wrapped
    `Element.prototype.animate` catches scripted ones as they are created.
    Scroll-driven animations and the inspector's own motion are left alone.
  - GSAP reads `Date.now()`, so its global timeline is time-scaled.
  - Everything else stepped from `requestAnimationFrame` or
    `performance.now()` reads a dilated clock.
  - `setTimeout` and `setInterval` delays stretch by the same factor. Apps
    commonly hold a state change, an unmount or a `finish()` on a timer as
    long as their transition, which at real speed cuts every slowed
    transition short. A timer the inspector asks for itself, recognised by
    its calling script, keeps real time, since on the page surface the
    inspector shares the page's window.
- **The clock dilates `performance.now()` and frame timestamps, never
  `Date.now()`**, which applications read as wall-clock time. It stays
  monotonic, so returning to 1× keeps the lag built up while slowed rather
  than jumping every running animation forward.
- **Hosts install the clock first in `<head>`**, because a library that keeps
  its own reference to `performance.now` before the clock exists keeps real
  time. Vite, Astro and the static HTML host put it ahead of every other
  script; Next.js renders it as the first script of the mount. The browser
  extension, which runs after the page, installs it when the page is first
  slowed, and libraries that read the clock on every frame still follow it.

## Consequences

- Nothing scans stylesheets for motion, so the tool costs nothing on a large
  page until it slows one. A slowed page sweeps its animations at most once a
  frame, and only on frames where something could have restyled it.
- There is no timeline: a slowed page cannot be scrubbed or stepped. The
  slowest speed is the stand-in for stepping.
- A restyle the sweep does not hear about (a `:hover` reached without a
  pointer event, say) is still caught at `animationstart`, after its delay.
- `performance.now()` and `event.timeStamp` can disagree after a page has been
  slowed, by the lag the clock kept.
- Slowed timers slow the app's own logic too (debounces, polling) while the
  tool is active; a timer already pending keeps the delay it was given.
- Libraries that step from `Date.now()`, and animations inside nested frames,
  keep real time.
