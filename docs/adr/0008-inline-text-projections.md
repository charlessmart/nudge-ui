# ADR-0008: Inline text editing uses semantic component projections first

Date: 2026-08-16
Status: Accepted

## Context

Design Tool needs a source-faithful way to edit visible page copy without
turning a temporary browser draft into canonical DOM state. A rendered string
may come from a React component prop (`label`, `text`, or another known visible
text prop) or from primitive `children`. The component invocation and its
authorship are more useful to an agent than a host-element `textContent`
mutation.

The interaction also needs native caret and selection behaviour. Making the
whole document editable would interfere with selection, navigation, drag, and
inspector keyboard authority. The temporary editing surface must therefore be
scoped and removed before a permanent preview is projected.

## Decision

1. Inline editing begins from the deepest visible text host and resolves a
   known text contract only when exactly one runtime string prop matches the
   rendered copy. Visible text contracts are ranked as `children`, `label`,
   `text`, `caption`, `description`, and `title`; structural and implementation
   props are not candidates. Ambiguous candidates are rejected until a later
   binding chooser is implemented.
2. JSX invocation metadata records `children` authorship as `literal`,
   `expression`, or `spread`, alongside existing prop authorship. This metadata
   and all runtime instrumentation remain dev-only under ADR-0002.
3. A session wraps only the selected text node in a temporary
   `contenteditable="plaintext-only"` host. Enter or blur commits, Escape
   cancels, and the host is unwrapped before the canonical change is appended.
   The browser mutation is never itself a durable identity or projection.
4. A successful semantic session appends exactly one existing
   `component-prop` change. The React runtime Adapter owns the permanent
   rerender, so no rendered host attribute, inline style, or managed CSS rule
   represents text intent. Existing canonical history, durable session, revert,
   undo/redo, and prompt paths remain authoritative.
5. If no confident semantic match exists, this first slice declines the edit.
   A framework-neutral `text-content` projection and durable rendered-instance
   evidence are reserved for the following inline-text slices; repeated
   invocation multiplicity is not guessed here.

## Consequences

- Text contracts add a `text` control while preserving bounded select and
  boolean controls.
- The inspector can show the resolved component/property while a native draft
  is active, and all inspector selection, drag, navigation, and history
  shortcuts stand down for that session.
- A semantic text edit has one canonical callsite record regardless of the
  number of keystrokes in the draft.
- Repeated callsites and unresolved rendered copy require later evidence and
  must not be projected onto an arbitrary instance by this slice.
