# ADR-0020: Inline text editing owns interaction handoff

Date: 2026-09-12
Status: Accepted

Clarifies ADR-0008 where it assigns blur and inspector interaction authority.

## Context

ADR-0008 established a scoped native editing surface and canonical semantic or
rendered-text projection. The element selector later guarded that surface by
rejecting every double-click while an inline session was active.

Blur commits are deliberately deferred for Escape and IME correctness. During
that interval, rejecting a second double-click discards the user's request to
edit another target. A commit can also replace application DOM before the
browser emits the second mousedown or final `dblclick` event. Binding ambiguity
can keep the first session active until the user makes an explicit choice.

These are interaction lifecycle concerns. Host framework Adapters should not
need to coordinate browser gestures or temporary editor sessions.

## Decision

The inline-text module owns text-edit interaction intent and active-session
handoff.

- The element selector forwards pointer-down and double-click intent instead
  of rejecting a double-click based on active-session state.
- At most one inline-text session remains active.
- A double-click on another text target commits an unambiguous current draft
  and starts the requested target without another gesture.
- The first pointer phase retains handoff intent across the current session's
  blur commit. This prevents canonical projection from losing the gesture when
  it replaces the target DOM before the final double-click phase.
- A disconnected requested target is resolved again from the interaction point
  after the current commit.
- A handoff remains an inspector-owned gesture when the requested target can no
  longer begin editing; it never falls through to an application action.
- If a semantic binding decision is required, the current draft remains active
  and the requested target is retained. Completing or cancelling the current
  session continues to the retained target.
- A commit prepares its canonical change and validates projection evidence
  before ending the active session. Validation after unwrapping that temporary
  editor either succeeds or restores the draft, so a rejected commit does not
  silently discard user input.
- Double-click suppression belongs to the element selector using the result of
  the inline-text intent. Other native input and application-action guards stay
  within the active editor implementation.

The semantic projection and host runtime Adapter seams from ADR-0007,
ADR-0018, and ADR-0019 do not change.

## Consequences

- Text-edit transition policy has one seam shared by every host that runs the
  inspector client.
- Deferred blur, Escape, and IME behavior remain intact.
- Commit settlement is transactional from the user's perspective: either a
  canonical change is appended or the editable draft remains available.
- The selector no longer resolves text hosts or decides how one edit session
  transitions to another.
- Pointer-down is part of the text-edit interaction interface because browser
  double-click delivery is not stable across application rerenders.
- Framework Adapters continue to provide semantic evidence and projection only;
  they do not acquire browser interaction responsibilities.

## Verification

- A document-level integration test reproduces blur followed by a second
  double-click before the deferred commit runs.
- Inline-text tests cover target re-resolution after projection replaces DOM
  and a pending handoff blocked on semantic binding choice.
- A browser test edits two rendered-text targets consecutively using one
  double-click per target.
