# Inspector architecture implementation plan

Implement the phases below in dependency order. The governing decision is
[ADR-0021: Durable edit intent excludes preview and gesture state](./adr/0021-durable-edit-intent-excludes-preview-state.md).

## Objective

Make the inspector's edit → preview → handoff workflow dependable across
rerenders, persistence, multiple inspected documents, and agent completion.
Preserve the local development tool: users edit the real application, preview
changes, and hand structured intent to a coding agent that edits source.

The primary scope is `packages/inspector`, with supporting updates to tests,
package consumers, and documentation. File paths below are starting points;
verify their current contents before implementation.

## Architectural decisions

- Durable intent contains the requested change, target identity, scope, baseline
  values, and evidence needed to interpret the change. Document-derived evidence
  can be durable. Live DOM objects and preview, gesture, or verification execution
  state belong outside canonical records.
- Operation, target, scope, and evidence are distinct dimensions. Use record
  variants that admit valid combinations. Keep target resolution separate from
  preview outcome.
- Changes and projection remain separate modules. Both consume a shared,
  browser-independent edit model that may depend on shared CSS value types but
  has no dependency on React, DOM objects, storage, or projection implementations.
- Preview diagnostics belong to a change revision, logical document, active
  document session, and verification attempt. They never advance canonical
  revision or enter undo history. Reject results that no longer describe the
  active edit and projection.
- Workspace state survives inspector remount. Mounted inspector resources and
  inspected-document resources have explicit, independently disposable owners.
  React context exposes these owners; focused subscriptions deliver updates.
- Handoff uses deterministic durable intent and preserves unsent edits during
  reconciliation. Clear changes only when implementation can be positively
  verified. Preserve unresolved results when browser evidence is insufficient.

## Preserved behavior and scope limits

Preserve the host transport and framework runtime adapter interfaces described
in [ADR-0018](./adr/0018-self-contained-client-and-host-runtime-adapters.md) and
[ADR-0019](./adr/0019-shared-client-transport-capabilities.md). Keep the inspector
client independent of the application's UI runtime and keep production builds
free of inspector instrumentation.

Keep MCP optional. A general plugin system, arbitrary prop editing, and new
Canvas features are outside this plan. Defer new frameworks until the integration
gate passes. Future framework support must express partial capabilities through
adapters rather than introduce host-name conditionals in the shared core.

## Implementation rules

1. **Keep refactors behavior-preserving.** Isolate intentional behavior changes
   (including scope fallback fixes and UI status changes) in separate PRs with
   regression tests. The documented incompatible-session discard is an explicit
   exception when changing the stored schema.
2. **A phase can span several PRs.** Each PR has one reviewable purpose, passes
   applicable checks, and states its dependencies and rollback limits. Add tests
   alongside each change; Phase 4 is the final integration gate.
3. **Directory structure follows the decisions**, not the reverse. Do not
   reorganise first.
4. **Invariant to protect:** `CommitResult` stays three-valued
   (`applied | unchanged | blocked`) and `blocked` stays distinguishable from
   `unchanged`. Under ADR-0020, a blocked commit restores the draft when the
   write lease refuses the commit. Preserve transactional commit settlement.
5. **Do not touch** `inline-text/inlineTextLifecycle.ts`. It is an intentional
   registration seam and should stay one.

## Implementation sequence

Define meaning first, establish ownership next, and defer optional cleanup:

```
Phase 0  vocabulary + invariants (no code)
Phase 1  edit vocabulary, target identity, scope, revisions, unresolved states
Phase 2  extract shared edit model; move preview diagnostics out of intent
Phase 3  workspace / session / document ownership + teardown
Phase 4  final integration verification of the full path
Phase 5  simplify plumbing, caches, codecs, exports, duplicated helpers
```

---

## Phase 0 — Establish the implementation contract

Read [ADR-0021](./adr/0021-durable-edit-intent-excludes-preview-state.md) and
[ADR-0020](./adr/0020-inline-text-interaction-handoff.md). Inspect the affected
modules and existing tests before changing their interfaces.

Maintain a model specification beside the shared model, in module documentation
or an adjacent README. Start with the existing types and name the owner of each
of these responsibilities:

- Identifying the operation, target, scope, and supporting evidence.
- Resolving targets after rerenders, route changes, and document replacement.
- Expressing structural relationships without guessing the source implementation.
- Distinguishing preview success, agent completion, and verified implementation.

Include a state ownership inventory covering workspace, mounted inspector, and
inspected document lifetimes. Phase 1 completes the type mapping; Phase 3
implements resource ownership. Link the maintained specification from PRs.

**Acceptance**

- Each responsibility has a named owning module and documented invariants.
- Each stateful resource has an intended owner, lifetime, and disposal path.
- Existing tests and coverage gaps are identified for the first implementation PR.

---

## Phase 1 — Edit vocabulary and target identity

Define the edit model and its valid states before moving record definitions.

**Work**

1. Map every current change and structural variant before defining new types.
   Distinguish operation (style, token value, prop, text, move, delete), target
   identity, application scope, and supporting evidence. A component-prop edit
   can target a source callsite or a rendered occurrence; those are not mutually
   exclusive intent kinds. Use discriminated variants to admit valid
   combinations, rather than an unrestricted product of independent enums.
2. Keep target resolution (`resolved | missing | ambiguous`) separate from
   preview outcome (`applied`, `overridden`, or operation-specific failures).
   A resolved target can have an overridden preview. Define handling at the
   consumers that need each fact, without forcing one universal status union.
3. Trace `getEditScope` callers and preserve explicit source-site choices.
   If missing evidence silently broadens an instance edit, reproduce it and fix
   it in a separate behavior-change PR. Absence of an override alone must not
   trigger a scope change.
4. Classify each `StructuralMove.presentation` field as durable interpretive
   evidence or transient replay state. Document the reason. Move only the latter
   in Phase 2, preserving required preview and undo behavior. Structural intent
   describes the desired relationship without guessing its source mechanism.
5. Establish focused behavioral coverage before record/store changes: blocked
   commit settlement, undo/redo, handoff preserving newer edits, and ambiguous
   target resolution. Reuse existing coverage where it already proves the rule.

**Acceptance**

- The maintained model specification maps every `ChangeRecord` and
  `StructuralChange` to its operation, valid target/scope, evidence, and separate
  resolution and preview handling rules.
- Explicit source-site intent and unresolved instance evidence remain distinct.
- Existing handoff and commit-settlement behavior has regression coverage before
  dependent refactors begin.

---

## Phase 2 — Extract the shared edit model; preview diagnostics leave intent

**Scope rule for the new model:** browser-independent does not mean
dependency-free. It may depend on shared CSS value types. It must **not** depend
on React, DOM objects, storage machinery, or projection implementations.

**Work**

1. Extract the shared edit model into its own module. Move the record vocabulary
   that currently lives in unrelated homes — `TextContentChangeRecord`
   (`inline-text/textChangeBoundary.ts`), `RenderedInstanceRef`/`RenderedInstanceOverride`
   (`projection/renderedInstance.ts`), `RenderedInstanceRef` inside
   `StructuralChange` (`changes/structuralTypes.ts`) — behind one owned
   vocabulary. `changes/` and `projection/` remain separate concepts and separate
   directories; both depend on this model.
2. **Consolidate the duplicate validators** into per-variant codecs on that
   model: one `RenderedInstanceRef` validator, shared equivalent key validation, one shared codec replacing the parallel `Serializable*Change`
   family in `canvas/sessionStore.ts`.
3. **Move preview diagnostics out of canonical intent.** A single
   `Map<changeKey, PreviewResult>` is *insufficient* — Canvas documents produce
   different results, and late results must not overwrite newer ones. Model the
   identity explicitly:

   Define logical identity (host or Canvas card) separately from a unique
   document-session identity that changes on reload or replacement. A card ID
   alone cannot identify a live document. Route results by value-based IDs,
   not object-reference equality.

   Each result identifies the canonical revision whose projection was verified
   and the verification attempt in that document session. Prefer one source
   revision; if separate workspace and applied revisions are necessary, specify
   their relationship and valid transitions before introducing both counters.

   Acceptance checks compare against the active workspace revision, document
   session, and current verification attempt, not just the stored diagnostic.
   Advancing the workspace invalidates prior results; an older result is rejected
   even if no newer result has arrived. Reload/disposal invalidates the session,
   and a newer attempt supersedes earlier attempts at the same revision. Reads
   expose only current results (or an explicit pending state). Writes never
   advance canonical revision or enter undo history.

   Existing `reportsByDocument` and `reportsByCanvasCard` demonstrate per-document
   reporting, but do not by themselves prove these freshness guarantees.

4. Delete `replaceChangeRecordsForDiagnostics` in `changes/workspaceChanges.ts`.
   It exists only because diagnostics were stored on records.
5. Update `handoffChangeFingerprint` in `agent/verification.ts` to consume
   durable intent directly, using deterministic serialization. Define stable
   field ordering or canonical encoding so equivalent restored records retain
   their identity; do not use arbitrary object insertion order as the contract.
6. Only after 3-5: consolidate `changesLog.ts` + `workspaceChanges.ts` behind one
   explicit store interface, preserving `CommitResult` (ground rule 4).
7. **Delete session migration support** under ADR-0021 item 4 when changing the
   stored record shape. Remove legacy schema lists, migration-only record types,
   scratch-document replay for migration, multi-version reads, and migration-only
   branches from `canvas/sessionStore.ts`.
   Retain a current schema identifier, current-record validation, and safe discard
   for malformed or unsupported data. Versioned storage keys are optional;
   schema identification is required. Update `docs/browser-storage.md` with the
   current format and discard policy.

**Suggested PR boundaries**

- Extract the model and consolidate equivalent validators/codecs.
- Separate diagnostics and replay-only data, with freshness tests and handoff
  fingerprint updates.
- Remove legacy migration support when switching to the new stored schema.
- Consolidate store ownership behind an explicit interface.

Keep each intermediate state valid; document incompatible stored-data rollback
limits rather than promising that reverting code can recover discarded sessions.

**Acceptance**

- Two Canvas documents hold different diagnostics for the same change at once.
- Old results are rejected after a newer edit even before any new diagnostic
  arrives; superseded attempts at the same revision are also rejected.
- Reloading a card with the same ID or disposing a session rejects its old results.
- Preview-only state does not affect handoff fingerprints or canonical history.
- Durable evidence survives serialization, undo/redo, and handoff.
- The shared model has no imports from projection implementations, React, DOM,
  or persistence machinery. Record actual dependency changes, not a required
  count of edges between directories.
- Legacy migration paths are removed. Valid current-schema sessions restore;
  malformed and unsupported sessions are safely discarded.

---

## Phase 3 — Explicit ownership and teardown

**Work**

1. Introduce a **session factory** that owns construction, connections, and
   teardown, and keeps workspace, mounted inspector, and document lifetimes distinct:
   `createWorkspace()`, `createInspectorSession(host)`, `createDocumentSession(doc)`.
   These are provisional interfaces: pass the owning workspace/document
   dependencies explicitly. Persisted Canvas cards and camera data need an owner
   that survives inspector remount; their mounted listeners have a session
   lifetime. Use the Phase 0 ownership inventory to assign each resource.
   Expose it to editors through React context. **The context is a delivery
   mechanism, not the domain model** — do not push domain state into it.
2. Keep focused subscriptions. Do not merge stores into one context value that
   re-renders everything on every change.
3. Give the document lifetime a real boundary so caches die with the document.
   This is what makes `tokens/resolution.ts` splittable, and it removes the need
   for `reset*` test hooks (`resetSourceSiteMatchCache`, `resetRenderedInstanceState`,
   `resetTextProjectionState`, `resetFitAllFlag`, and the rest).
4. Connect observers in `tokens/resolution/cssomCollector.ts` and
   `canvas/rendererElementSelector.ts` to disposal. Give history patches in
   `canvas/rendererBootstrap.ts` an ownership-aware teardown path. Scope write
   guards in `canvas/workspaceLease.ts` to their owning session.
5. Move lifecycle orchestration flags from `index.ts` into the session object.

**Acceptance**

- Mount → unmount → mount leaves no listeners, observers, timers, or patched
  globals behind (assertable in jsdom).
- Disposing a document session prevents later callbacks from publishing and
  releases its owned resources. A replacement session cannot observe old cached
  data. Test observable behavior without requiring inspection of private caches
  or garbage-collection timing.
- Restore patched globals only while the session still owns the installed patch;
  teardown must not overwrite a later patch from the application or another tool.
- Test iframe reload and replacement in the existing browser suite; jsdom alone
  does not establish cross-realm lifecycle correctness.

---

## Phase 4 — Verify the full path end to end

This is the final integration gate before Phase 5 or framework/Canvas expansion.
Add unit and integration coverage in the phase that changes behavior; do not
postpone regression coverage until this phase.

**Path:** edit → preview → undo/redo → restore → handoff → application refresh →
reconciliation.

**Required acceptance checks**

| # | Check |
| --- | --- |
| 1 | Two Canvas documents produce **different** diagnostics for the same edit. |
| 2 | A stale diagnostic is rejected after a newer edit, before any newer result exists, after document reload/disposal, and after a newer attempt at the same revision. |
| 3 | A rerendered target becomes **ambiguous** and is not silently re-bound to a different element. |
| 4 | Agent completion arriving while the user has **unsent edits** preserves those edits (covered through `verifyAndReconcileHandoff`). |
| 5 | Preview success, agent completion, and verified implementation remain **distinguishable** in the UI, not collapsed into one status. |
| 6 | `blocked` commits restore the draft; `unchanged` commits do not (ADR-0020 regression guard). |

Add these as tests, not as manual QA. Checks 1-2 can be unit-level against the
Phase 2 diagnostics store, with browser coverage for actual iframe reload; 5-6
belong in the existing shell/agent suites. Introduce any missing UI distinction
in a separate behavior-change PR. Exercise the complete path in a real consumer
browser fixture; unit checks alone do not establish end-to-end correctness.

---

## Phase 5 — Simplification (only after the above)

Treat this phase as a shortlist, not a mandatory rewrite. Each PR must reduce
conflicting rules, caller obligations, or demonstrably unused code while
preserving behavior.

- Finish the thin runtime entry after lifecycle extraction; move test utilities
  to a testing entry and verify package consumers.
- Remove misleading pass-through exports and modules confirmed unused across
  runtime, tests, examples, and package exports.
- Consolidate helpers only where their semantics match.
- Consider splitting resolution, persistence, or inline-text modules where
  ownership is now clear. File length alone does not justify a split.
- Compare listbox interaction and accessibility requirements before sharing their
  implementation. Keep legitimate differences explicit.
- Reduce repeated editor plumbing where session access makes callers simpler.

One-file directories need no change solely because they contain one file.

Deferred indefinitely: a general plugin system, arbitrary prop editing,
additional Canvas features. New framework support is deferred until Phase 4
passes. Keep MCP optional as it is.

---

## Session compatibility policy

Under ADR-0021, the tool maintains no session migration window while it has no
users. Discard incompatible stored sessions instead of partially restoring or
migrating them. Keep an explicit current schema identifier and validation.

An incompatible upgrade loses the stored session. Document that behavior in
`docs/browser-storage.md`; reverting code does not recover discarded data.
Before a record-shape change after users adopt the tool, introduce a compatibility
window through a superseding ADR.

## Completion and handoff

Run the applicable repository checks from the root package scripts: package
builds, type checking, linting, and the fast unit suite. Run targeted shell,
agent, consumer browser, and package verification checks for affected behavior.
Reuse passing coverage and add tests for the contract being changed.

For each implementation PR, report the concrete behavior or ownership change,
validation performed, dependent work, and rollback limits. Keep the maintained
model specification synchronized with the implementation. Complete Phases 0–4
before taking on the evidence-based cleanup in Phase 5; document which cleanup
items were implemented and which were unnecessary.
