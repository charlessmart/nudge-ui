# ADR-0005: Contextual selectors for global token previews

Date: 2026-07-16
Status: Accepted

## Context

ADR-0003 requires visual edits to be projected through one managed stylesheet
and forbids inline styles. It also keys element edits by stable `data-cid` and
`data-src` identity so React re-renders do not detach an edit from its source
site.

A global design-token edit has a different identity. Changing
`--color-text-primary` is intended to affect every consumer in one active theme
context, not one instrumented element. Keying that change by element identity
would either fail to update all consumers or create many contradictory element
overrides. Applying it unconditionally to `:root` would leak a dark-theme edit
into light and other themes.

## Decision

The inspector continues to maintain exactly one
`<style id="design-tool-styles">` element. The stylesheet remains a pure
projection of the canonical change set, and the inspector never writes inline
styles to tracked host elements.

Element-property edits continue to use the stable `data-cid` + `data-src`
identity required by ADR-0003.

Global token-definition previews are the sole exception to that selector
shape. They use the selector and enclosing media, supports, scope and layer
context of the active authored token declaration. Their canonical identity is
the custom-property name plus declaration source and context. This preserves
theme boundaries while allowing one preview rule to update every consumer.

Token previews are session-only. Source files are not rewritten; source
location and context are retained for Changes and prompt handoff.

## Consequences

- A light-theme token edit cannot silently overwrite its dark-theme variant,
  and vice versa.
- Global token changes do not fabricate React component or rendered-instance
  identity.
- Undo, redo, revert, clear and prompt generation operate on the same canonical
  token delta used to rebuild the managed stylesheet.
- The managed rule representation must preserve conditional wrappers in
  addition to selector and declarations.
- ADR-0003 remains authoritative for element edits and the no-inline/single-
  stylesheet constraints; this ADR supersedes only its universal element-
  selector requirement for global token definitions.

## Verification

- Unit tests serialize contextual token rules and keep global token history
  distinct from element history.
- Playwright edits one theme variant, verifies all consumers update, switches
  themes, and verifies the inactive variant was not overwritten.
- Production builds contain no inspector, token catalog or managed preview
  state.
