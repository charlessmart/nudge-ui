# 0019 — Source-site and unlinked-instance edit scope

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 2 — Core loop reliability

## What to build

Make the scope of a visual edit explicit. By default, an edit targets the JSX
source site represented by `data-cid` + `data-src`, preserving the current
behaviour and reflecting the structure the coding agent will edit. Before an
edit is applied, the inspector counts the rendered elements matching that
source site and communicates the scope, for example: "Affects 6 rendered
components."

Offer an **Unlink this element** action when more than one rendered instance
shares the source-site identity. Unlinking creates a runtime-only instance
identity and changes subsequent managed-stylesheet rules to target only that
selected DOM instance. The instance identity is preview state, survives normal
React updates when the DOM node survives, and is never represented as a stable
source identifier.

The changes log and generated prompt distinguish a source-site edit from an
unlinked-instance override. An unlinked prompt includes useful instance
evidence such as source site, rendered index, primitive props and short text,
and asks the coding agent to implement the appropriate data-driven conditional
without presenting the runtime identifier as source code. If the DOM node is
replaced, the inspector reports that the instance preview was lost rather than
silently broadening the edit back to every instance.

HITL verification is required because the wording and unlink interaction are
part of the product's central mental model.

## Acceptance criteria

- [x] Source-site scope remains the default for every edit
- [x] The inspector counts currently rendered matches and shows "Affects N rendered components/elements" before editing
- [x] A single match does not show unnecessary unlink UI
- [x] Multiple matches offer an "Unlink this element" action
- [x] Unlinking assigns a runtime-only instance identity and subsequent rules affect only the selected instance
- [x] Unlinked instance identity is not presented as a stable source location or emitted as an implementation selector
- [x] Changes record whether their scope is `source-site` or `instance-preview`
- [x] Prompt output for an instance preview includes source site, rendered index and available props/text evidence
- [x] Replacing the selected DOM node produces a clear "instance preview lost" state and never broadens the rule silently
- [x] Re-linking removes the instance override and returns editing to source-site scope
- [x] Unit tests cover match counting, unlink/re-link and scope-specific selector generation
- [x] Sandbox e2e coverage edits six repeated items together, unlinks one, then edits only that item
- [x] Production build contains no instance identity or scope UI
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

- #0018 — Reliable host-element instrumentation
