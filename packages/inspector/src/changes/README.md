# Inspector edit model contract

This document is the Phase 0 specification and implementation map for the
inspector edit model. The record definitions are in [`types.ts`](./types.ts),
[`structuralTypes.ts`](./structuralTypes.ts), and the shared identity model in
[`editModel.ts`](./editModel.ts). `projection/renderedInstance.ts` re-exports
the shared rendered-instance types and guards for compatibility while owning
DOM resolution and projection state. Current behavior and target ownership
boundaries are labeled separately; this document does not add a runtime
interface.

## Model dimensions

Every canonical record has four separate concerns:

- **Operation** — what the user wants to change: a style declaration, token
  value, component prop, text value, deletion, or move.
- **Target** — the authored location or rendered identity to which the
  operation refers.
- **Scope** — whether the operation applies to the source site and its outputs
  or to one rendered output. A missing scope currently means the historical
  source-site default for the applicable record types.
- **Evidence** — bounded, serializable facts used to interpret or resolve the
  target. Evidence is not a live DOM node, React object, preview result, or
  timer state.

Canonical intent is the `ChangeRecord` or `StructuralChange` payload. Preview
and verification data is separate from that payload: document-scoped
projection reports remain owned by the projection modules, while CSS preview
diagnostics are owned by [`previewDiagnostics.ts`](./previewDiagnostics.ts).
Each stored CSS diagnostic is tied to a canonical workspace revision, logical
document, live document session, and verification attempt.

## Current record mapping

### `ChangeRecord` variants

| Variant | Operation | Target and scope | Evidence and baseline |
| --- | --- | --- | --- |
| `ElementChangeRecord` | Change one CSS property using a raw value or token value. `state` selects the supported interaction state when present. | Source-site identity is represented by the instrumentation `cid` (component/site id), `file`, `line`, and `selector`. A rendered-instance edit uses `scope: "rendered-instance"` and `instanceOverride.target`; omitted scope and `scope: "source-site"` use the source-site selector. | `oldToken`/`oldRawValue` are the baseline; `newToken`/`rawValue` are the requested value. `sourceProperty` and `sourceAuthoredValue` preserve CSSOM source context. `runtimeEvidence` and the instance override retain bounded rendered facts. Preview outcomes live in `previewDiagnostics.ts`. |
| `TokenChangeRecord` | Change a token value in the managed stylesheet and in the eventual source token definition. | The token is identified by `tokenName`, source file/line, `selector`, and `context`. This variant has no `scope`, instrumentation `cid`, or rendered-instance target. | `oldRawValue` is the baseline and `rawValue` is the requested value. `context` and `contextLabel` preserve conditional CSS context; `source` identifies the authored token location. Preview outcomes live in `previewDiagnostics.ts`. |
| `ComponentChangeRecord` | Change one component prop. | `target` identifies the framework, component definition, callsite, component name, and source location. `scope` is `source-site` or `rendered-instance`; `createComponentPropChange` defaults it to `source-site`. | `before` is a value or default baseline; `after` is the requested value; `authoredAs` describes the authored prop form. Optional `evidence` records the rendered invocation, including occurrence, props, accessible name, original text, and mounted count. |
| `TextContentChangeRecord` | Replace rendered text with `after`. | `target.sourceSite` identifies the instrumented site. `scope` is `source-site` or `rendered-instance`; `id` identifies the text change. `selector` is the source-site projection selector, not a complete rendered identity. | `before` and `target.beforeText` are the baseline. `target` also carries bounded props, accessible name, occurrence, and optional `textNodePath`; the path is document-local evidence. Optional `evidence` records the semantic component binding. `authoredAs` describes the source text form. |

`ElementChangeRecord.kind` is optional for compatibility with existing element
records; `isElementChange` is the fallback branch after the other kinds are
excluded. `TextContentChangeRecord.property` is explicitly absent. These are
current type-shape constraints, not additional operation kinds.

### `StructuralChange` variants

| Variant | Operation | Target and scope | Evidence and preview meaning |
| --- | --- | --- | --- |
| `StructuralDelete` | Remove one rendered element from the document. | `target` is a `RenderedInstanceRef` containing a source site and bounded rendered evidence. The operation is inherently one rendered instance; there is no separate scope field. | The rendered-instance reference is the evidence. The `id` is the structural history identity. DOM nodes and deletion placeholders belong to `projection/structuralProjection.ts`, not the record. |
| `StructuralMove` | Move one rendered element to a destination relationship. | `target` identifies the element; `source.parent`, `destination.parent`, and optional `destination.before` identify the source parent, destination parent, and anchor. The relationship is inherently rendered-instance scoped. | All four rendered-instance references are durable evidence for resolving the relationship. The `presentation` fields are classified individually below. |

`StructuralMove.presentation` is currently durable record data, but it is not
used by document projection to choose or move a DOM node:

- `sourceParentTag` and `destinationParentTag` are bounded descriptive evidence
  used by the change log and prompt. They help a consumer explain the source
  and destination relationship after serialization.
- `fromIndex` and `toIndex` are bounded relationship evidence currently used by
  `prompt/generatePrompt.ts` to collapse move history and detect a return to the
  starting position. They are not DOM replay instructions.

Phase 2 may move fields that are only presentation data after replacing those
consumers with derived or explicit handoff data. Until then, preserve the
prompt and undo behavior with tests.

Structural intent describes the requested relationship without claiming which
source mechanism will implement it. A missing or ambiguous parent or anchor is
not a reason to guess another element.

## Target resolution and preview outcomes

These are different facts and must not be represented by one universal status.

### Target resolution

- [`projection/renderedInstance.ts`](../projection/renderedInstance.ts) resolves
  a `RenderedInstanceRef` as `resolved`, `missing`, or `ambiguous`. An ordinal
  alone cannot select among identical outputs.
- [`projection/textProjection.ts`](../projection/textProjection.ts) resolves a
  `TextProjectionTarget` with the same three outcomes. It may use before/after
  text evidence, but it does not use `occurrence` alone.
- Structural projection resolves the target, source parent, destination
  parent, and anchor independently. Its report can identify `target`,
  `source-parent`, `destination-parent`, `anchor`, or an illegal destination as
  the reason a projection did not apply.
- Component target selection is owned by the component runtime and semantic
  binding modules. `componentChangeToOverride` fails closed for a rendered
  instance, repeated expression/spread prop, or repeated value without an
  explicit safe source-site choice. There is no separate public resolution
  result type for component props today.
- CSS element and token preview currently resolve selectors and verify values
  in the same path. A selector with no target is reported as a style conflict
  with reason `target-missing`; this is existing behavior, not canonical target
  identity.

### Preview and source verification

- [`projection/managedStylesheet.ts`](../projection/managedStylesheet.ts)
  reports CSS preview as `applied` or `conflict`, with reasons such as
  `target-missing`, `inline-style`, `important`, and `token-drift`.
- Rendered-instance, text, and structural document reports use
  `applied`, `missing`, `ambiguous`, or `overridden`. These reports are scoped
  to a document or Canvas card and do not change canonical intent.
- [`agent/verification.ts`](../agent/verification.ts) performs a separate
  positive source verification after the inspector preview is removed. It can
  reconcile style, text, and structural records when the source result is
  observable. Component prop records remain unresolved because rendered output
  cannot prove that the source prop was edited.
- `CommitResult` from [`workspaceChanges.ts`](./workspaceChanges.ts) is a
  canonical write result: `applied`, `unchanged`, or `blocked`. It is neither a
  target-resolution status nor a preview result. `blocked` must remain distinct
  from `unchanged`, and a blocked inline-text commit restores its draft.

Examples: a target can resolve uniquely while its CSS preview is overridden;
an `applied` preview only proves that the managed projection painted, not that
the agent changed source; and an agent completion can be received while newer
unsent intent remains in the workspace.

## Owning modules and invariants

| Responsibility | Current owner | Invariants |
| --- | --- | --- |
| Record shapes and type guards | `changes/types.ts`, `changes/structuralTypes.ts`, `changes/editModel.ts`, `componentSemantics/types.ts` | Canonical records contain serializable intent and bounded evidence, never live DOM or framework objects. Operation, target, scope, and evidence remain distinguishable. Shared rendered-instance and text guards reject document-local fields. `inline-text/textChangeBoundary.ts` is a compatibility re-export. |
| Per-variant durable codecs | `changes/codecs.ts` | The shared codec owns serializable change shapes, strict validation, and canonical round trips. It depends only on the edit model, component model, and shared CSS value types; it does not import storage or projection implementations. |
| Canonical keys, baselines, and merge rules | `changes/model.ts` | A merge preserves the first baseline and latest requested value. Returning to the baseline removes the canonical delta. Text records only merge when their stable evidence and before/after chain are compatible. |
| Workspace history and revision | `changes/workspaceChanges.ts` | Only canonical mutations advance revision or enter undo/redo. Diagnostic publication does neither. `CommitResult` remains three-valued. Reconciliation removes only positively verified records and cannot resurrect them through history. |
| Public change orchestration | `changes/changesLog.ts`, `changes/previewDiagnostics.ts` | Subscribers observe a complete workspace snapshot. CSS projection is derived from canonical records. Deferred verification publishes to the diagnostic store and is bound to the document captured at commit time. |
| Source-site and instance scope | `selection/editScope.ts`, `changes/editModel.ts`, `projection/renderedInstance.ts` | Missing or ambiguous rendered evidence fails closed. A partial repeated-source edit must not silently broaden to every output. The projection module re-exports the shared model while owning resolution. |
| Component intent and runtime override | `componentSemantics/changeModel.ts`, `componentSemantics/textBinding.ts` | A rendered-instance component record is not converted into a callsite-wide override. Repeated expression and spread props are not broadened without proof. |
| Text target resolution and projection | `changes/editModel.ts`, `projection/textProjection.ts` | Before text is part of identity. Text-node paths are bounded document evidence. `inline-text/textChangeBoundary.ts` re-exports the model for compatibility; projection restores only its own marker and value. |
| Structural capture and projection | `projection/structuralProjection.ts`, `projection/structuralProjectionBoundary.ts` | Every target, parent, and anchor must resolve exactly and satisfy the shared containment rules. DOM placeholders, observers, and applied nodes remain document-local. |
| Persistence and handoff | `canvas/sessionStore.ts`, `changes/codecs.ts`, `prompt/generatePrompt.ts`, `agent/verification.ts`, `changes/previewDiagnostics.ts` | The codec handles change values; the session store assembles the durable session, validates storage-owned fields, and applies hydration side effects. Session data and handoff fingerprints carry durable intent, not preview diagnostics or DOM artifacts. Handoff reconciliation preserves newer unsent edits. |

## Ownership and disposal contract

The lifetimes below are the Phase 0 target boundaries for the rearchitecture.
The current implementation still has module-level state and reset helpers;
known mismatches are called out so the ownership work has a concrete scope.

| Lifetime | State that belongs to it | Disposal expectation |
| --- | --- | --- |
| Workspace | Canonical change contents, revision, undo/redo, workspace subscriptions, persisted Canvas card/camera state (`workspaceChanges.ts`, `canvasStore.ts`, `sessionStore.ts`), and the workspace write lease/guard (`canvas/workspaceLease.ts`) | Survives an inspector React remount. It is cleared only by an explicit workspace clear/restore or final host teardown. Disposal stops workspace subscriptions, pending persistence work, and the lease heartbeat after the final write. `unmountInspector()` disposes mounted resources without clearing workspace intent. |
| Mounted inspector | React roots, host keyboard listeners, selection/UI state, inspection bridge, clipboard handoff controller, stale-detection timers, and mounted shell resources (`index.ts` and shell modules) | `unmountInspector()` owns stopping these resources: unmount roots, remove listeners, cancel controllers/timers, clear selection/layout, and remove inspector-owned host projection. It must not dispose workspace intent merely because the UI remounted. |
| Inspected document session | Managed stylesheet state, rendered-instance/text/structural applied state and reports, CSSOM resolution caches and observers, renderer selectors, document-local DOM markers/placeholders, and renderer history patches (`canvas/rendererBootstrap.ts`) | The host document and each Canvas iframe/reload have independent lifetimes. Disposal disconnects observers, cancels queued validation, restores only patches still owned by the session, removes only inspector-owned DOM artifacts, invalidates late callbacks/reports, and releases document caches. A Canvas card ID is not a sufficient identity for a live document after reload or replacement. |

React context may deliver these owners to editors, but it is not the domain
model. Subscriptions should remain focused so a document diagnostic does not
rerender unrelated workspace or shell state.

## Test coverage and first-slice roadmap

Current coverage includes:

- Canonical style/token records, merge/baseline behavior, undo/redo, deferred
  verification, and instance-scoped CSS in
  [`changesLog.test.ts`](./changesLog.test.ts),
  [`workspaceChanges.test.ts`](./workspaceChanges.test.ts),
  `tokens/editActions.test.ts`, and `projection/managedStylesheet.test.ts`.
- Component target identity, scope safety, runtime overrides, and semantic text
  binding in `componentSemantics/changeAction.test.ts`,
  `componentSemantics/reactRuntime.test.ts`, and
  `componentSemantics/textBinding.test.ts`.
- Text record validation, merging, persistence, prompts, target resolution,
  lazy mounting, and override handling in `inline-text/textContentChange.test.ts`
  and `projection/textProjection.test.ts`.
- Rendered-instance ambiguity and evidence, edit-scope decisions, structural
  delete/move projection, and renderer protocol validation in
  `projection/renderedInstance.test.ts`, `selection/editScope.test.ts`,
  `projection/structuralProjection.test.ts`, and
  `canvas/rendererStylesheet.test.ts`.
- Persistence exclusions, prompt handoff, newer unsent values, source
  verification, and stale detection in `canvas/sessionStore.test.ts`,
  `prompt/clipboardHandoff.test.ts`, `agent/verification.test.ts`, and
  `canvas/staleChangeDetector.test.ts`.
- CSS preview diagnostic ownership and freshness rules in
  [`previewDiagnostics.test.ts`](./previewDiagnostics.test.ts), including
  revision, document-session, and verification-attempt invalidation.

The first implementation slices need focused coverage for:

1. A complete operation/target/scope/evidence matrix, including invalid
   combinations and the optional `ElementChangeRecord.kind` compatibility
   branch. The current tests are feature-oriented rather than one model
   contract.
2. Separate resolution and outcome cases for the same edit: a uniquely
   resolved target with an overridden preview, ambiguous resolution after a
   rerender, and a missing target before any preview result arrives. CSS style
   diagnostics do not yet have the same explicit resolution boundary as text
   and rendered-instance records.
3. Freshness of per-document preview diagnostics: two Canvas documents holding
   different results for one change, rejection after a newer workspace
   revision, rejection after a same-revision verification attempt, and
   rejection after iframe reload or document disposal. Existing structural and
   text report tests cover portions of this behavior, not the full contract.
4. Direct handoff-fingerprint tests for every record variant and structural
   gesture history, including the planned removal of replay-only
   `presentation` data without changing final prompt intent or undo behavior.
5. Lifecycle tests for mount → unmount → mount, observer/listener/timer
   disposal, and late callbacks from a replaced Canvas document. The existing
   reset helpers and focused module tests do not establish these ownership
   boundaries, and browser coverage is still required for iframe replacement.
