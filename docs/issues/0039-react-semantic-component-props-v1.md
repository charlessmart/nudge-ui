# 0039 — React semantic component props v1

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 3 — Design-system integration

## User story

As a designer working in a React/Vite application, I can select a typed
design-system component and change safe presentational props such as variant,
size, and disabled while previewing the real component output.

## Acceptance criteria

- [x] Local TypeScript enum/boolean prop contracts are discovered without
      component-authored instrumentation.
- [x] An optional package manifest supports npm design-system contracts using
      module-qualified component identity.
- [x] React invocation instrumentation and runtime imports exist only in dev.
- [x] A selected component exposes typed prop controls in the Inspector.
- [x] Prop changes rerender the real component and do not emit CSS declarations
      or inline style mutations.
- [x] Canonical changes preserve baseline/current values, callsite, contract,
      authored form, undo, redo, and single-change revert.
- [x] Changes and copied prompts describe component prop intent at the
      invocation callsite.
- [x] Durable session serialization accepts typed component prop changes.
- [x] The history ledger delegates kind identity, merging, and runtime
      projection instead of mixing component semantics with CSS bookkeeping.
- [x] Component records use a typed framework, structural default baseline,
      and compact semantic target without CSS compatibility fields.
- [x] Host invocation instrumentation is scoped to Vite's resolved application
      root rather than a repository-layout predicate.
- [x] Unit and Playwright coverage exercise contract extraction, runtime
      resolution, history, prompt output, and real component rerendering.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, the component Playwright test,
      and `pnpm --filter sandbox build` pass.

## Out of scope

- Vue/Svelte runtime Adapters.
- Canvas frame projection.
- Instance-only component prop scope.
- Arbitrary objects, callbacks, children/slots, and imported TS type-graph
  inference.
- Direct source write-back.

## Blocked by

- 0021 — Canonical change set and edit history.
