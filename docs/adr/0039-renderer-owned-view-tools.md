# ADR-0039: Renderer-owned view tools and a controller-owned animation timeline

Date: 2026-10-23
Status: Accepted

## Context

The canvas shows a running application inside a frame, with the inspector
drawn over it in the controller. Inspecting what the page renders is not the
same problem as previewing a style edit: outlines, an exploded view and
animation markers have to reach elements the controller cannot style, and a
projected stylesheet loses to the page's own rules, which is why managed
previews raise their specificity at all (ADR-0036).

The Animation tool pulls the other way. An `Animation` can only be paused,
slowed and scrubbed from the realm that owns the document, but its controls
have to re-render at frame rate while the pointer scrubs, and the page must
not be handed controls of its own.

## Decision

- The controller owns which view is active and the renderer applies it.
  `debug-view-state` carries the outline, explode and animation-marker flags
  over the frame protocol; the renderer owns every DOM write those views need.
- Outline view is one injected stylesheet scoped by an attribute on
  `documentElement`, so removing the attribute removes the view.
- Explode view records each inline override it makes, keyed by element and
  property, and restores them individually. A property the application
  rewrote meanwhile keeps the application's value.
- The Animation tool lives in the controller. It scans the selected element,
  forces an interaction state through the existing state-preview mechanism,
  and captures the animations that start, holding them paused in one group so
  the timeline can scrub, step and slow them.
- Explode view reports one boolean back over `debug-view-phase`, because the
  controller's element chrome is drawn flat over the frame and cannot follow
  transformed layers. The controller hides that chrome while a subtree is
  apart, and shows it again when the view is put away.

## Consequences

- The application document keeps nothing durable: turning a view off removes
  its stylesheet, its markers and its inline overrides.
- Two realms mean two scans. The renderer scans for content and the controller
  scans for controls, so both narrow their work to the elements whose rules
  declare a transition or keyframes.
- A renderer that cannot report a phase would leave the controller's chrome
  hidden. The controller clears that state on every view change and on every
  frame reload, so the failure ends with the next interaction instead of
  sticking.
- Explode view picks a layer by hit-testing the transformed document, so only
  what the pointer can reach can be selected, and picking a layer ends the
  view.
