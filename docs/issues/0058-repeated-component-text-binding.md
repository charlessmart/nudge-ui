# 0058 — Repeated component text binding

**Labels:** enhancement, ready-for-agent
**Type:** AFK
**Milestone:** 6 — Inline text editing

## Parent

- `docs/features/inline-text-editing.md`

## What to build

Make inline binding scope honest for component invocations rendered more than
once. The React Adapter reports mounted callsite multiplicity. A unique
callsite continues to use semantic prop projection; a repeated expression or
spread defaults to one durable rendered-text instance and produces data/source
guidance in the prompt. A repeated literal source-site edit is available only
through an explicit all-output choice.

Provide an inline binding chooser when multiple semantic props are equally
plausible and refuse projection when repeated-instance evidence is ambiguous.

## Acceptance criteria

- [x] React runtime callsite multiplicity is accurate through mount, unmount,
      Strict Mode, rerender, and Canvas renderer lifecycles.
- [x] Inline editing never silently applies one selected repeated expression
      change to every component instance sharing a callsite.
- [x] Repeated expression/spread text defaults to an instance-scoped
      `text-content` change with source-logic guidance in the prompt.
- [x] Repeated literal text can affect all outputs only after an explicit
      source-site choice whose scope is visible before commit.
- [x] Multiple equally plausible semantic props show an inline chooser;
      identical unresolved rendered instances are rejected as ambiguous.
- [x] Changes Log, diagnostics, durable session, and prompt retain the selected
      scope and bounded instance evidence.
- [x] Unit tests cover multiplicity and binding decisions; Playwright covers
      unique, repeated-expression, repeated-literal, chooser, and ambiguous
      cases in Inspect and Canvas.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with the dev-only contract held.

## Evidence

- `reactRuntime.test.ts` exercises Strict Mode mount/unmount and rerender counts;
  Canvas uses the same Adapter/projection seam in a frame-local runtime.
- `textBinding.test.ts`, `inlineTextEditor.test.ts`, `textContentChange.test.ts`,
  and `generatePrompt.test.ts` cover repeated expression/literal scope,
  before-text A/B evidence, equal candidates, ambiguity, persistence, and
  prompt handoff; the focused set passes 221/222 tests with one pre-existing
  stale Changes Log assertion.
- `m6-inline-text.dev.spec.ts` covers the Inspect chooser/scope flows,
  unique/chooser/ambiguous semantic behavior, and expression/literal text
  projections after switching to Canvas (9/9 pass).
- `pnpm lint`, `pnpm typecheck`, focused Vitest suites, and
  `pnpm --filter sandbox build` pass; the production bundle contains no
  `data-*` markers. The focused Oxlint run has no errors in the corrected
  0058 boundary/chooser files or `textProjection.ts`. The repository-wide
  `pnpm lint:oxlint` remains blocked only by the pre-existing
  `selectedGeometry.ts` error.
  The full inspector Vitest run retains two pre-existing stale `Clear Session`
  assertions (`ChangesLog.test.tsx` and `InspectorShell.test.tsx`) against the
  current `Clear Changes` label.

## Blocked by

- 0057 — Durable rendered-text projection.
