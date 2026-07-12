# 0020 — Verified managed-style preview

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## What to build

Deepen the managed-stylesheet module so applying a preview is an operation with
a verified result, not a fire-and-forget text write. After writing a managed
rule, read the selected element's computed property and report whether the
requested value painted successfully.

When the host cascade wins because of higher specificity, `!important`, an
inline declaration, animation or transition, the module returns a structured
conflict instead of allowing the inspector to claim success. It may apply a
preview-only escalation such as a more exact identity selector or
`!important`, but that mechanism must stay inside the preview implementation
and must not cause the generated agent prompt to recommend `!important` unless
the user explicitly authored it.

The token and style editors show a concise conflict state and retain the
requested change so it can still be handed to the coding agent.

## Acceptance criteria

- [x] Managed-style application returns requested value, computed value and an applied/conflict result
- [x] A successful result is reported only after the selected element computes to the requested value
- [x] Higher-specificity, inline, `!important`, animation and transition conflicts are detected
- [x] Any preview-only specificity escalation is isolated inside the managed-stylesheet implementation
- [x] Preview-only `!important` is never emitted as a source recommendation by default
- [x] Token and style editors visibly report when the host cascade prevents the preview
- [x] Conflicted edits remain in the changes log with enough evidence for agent handoff
- [x] Both source-site and unlinked-instance targets can be verified
- [x] Unit tests cover successful application and each supported conflict class
- [x] Sandbox e2e coverage demonstrates one successful edit and one reported cascade conflict
- [x] No inline `style` attribute is written to a tracked element
- [x] Production build remains free of managed-preview code
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

- #0019 — Source-site and unlinked-instance edit scope
