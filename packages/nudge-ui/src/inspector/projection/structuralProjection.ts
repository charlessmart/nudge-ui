import {
  captureRenderedInstance,
  matchesRenderedInstanceEvidence,
  resolveRenderedInstance,
} from "./renderedInstance.ts";
import type { RenderedInstanceRef } from "../changes/editModel.ts";
import { isStructuralProjectionReport } from "./structuralProjectionBoundary.ts";
import {
  resetWorkspaceChanges,
  workspaceChangeStore,
  type WorkspaceChangesSnapshot,
} from "../changes/workspaceChanges.ts";
import type {
  StructuralChange,
  StructuralDelete,
  StructuralMove,
  StructuralProjectionReason,
  StructuralProjectionReport,
  StructuralProjectionStatus,
} from "../changes/structuralTypes.ts";

export {
  isStructuralChange,
  isStructuralDelete,
  isStructuralMove,
  isStructuralProjectionReport,
} from "./structuralProjectionBoundary.ts";

/**
 * Controller-owned structural intent. It contains no DOM node, placeholder,
 * position, or renderer-local identity. Each document resolves a snapshot for
 * itself and keeps any physical preview artefacts private to that document.
 */
export type {
  StructuralChange,
  StructuralDelete,
  StructuralMove,
  StructuralProjectionReason,
  StructuralProjectionReport,
  StructuralProjectionStatus,
} from "../changes/structuralTypes.ts";

const VOID_PARENT_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const PHRASING_PARENT_TAGS = new Set([
  "a", "abbr", "b", "button", "cite", "code", "em", "label", "mark", "p", "small", "span", "strong", "time",
]);
const PHRASING_CHILD_TAGS = new Set([
  "a", "abbr", "b", "br", "button", "cite", "code", "em", "img", "input", "label", "mark", "small", "span", "strong", "time",
]);
const STRUCTURALLY_CONSTRAINED_PARENT_TAGS = new Set([
  "colgroup", "optgroup", "option", "select", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
]);

function isPhrasingElement(element: HTMLElement): boolean {
  return PHRASING_CHILD_TAGS.has(element.tagName.toLowerCase());
}

function isUnsupportedWrappedFlexRow(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (style?.display === "flex" || style?.display === "inline-flex")
    && (style.flexDirection || "row").startsWith("row")
    && Boolean(style.flexWrap && style.flexWrap !== "nowrap");
}

/** Conservative HTML containment policy shared by gesture and projection code. */
export function canContainElement(parent: HTMLElement, child: HTMLElement): boolean {
  const parentTag = parent.tagName.toLowerCase();
  if (VOID_PARENT_TAGS.has(parentTag)
    || STRUCTURALLY_CONSTRAINED_PARENT_TAGS.has(parentTag)
    || parent === child
    || child.contains(parent)) return false;
  return !PHRASING_PARENT_TAGS.has(parentTag) || isPhrasingElement(child);
}

export type StructuralMoveLegality =
  | { valid: true; sourceParent: HTMLElement; destinationParent: HTMLElement; before: HTMLElement | null }
  | { valid: false; reason: StructuralProjectionReason };

/**
 * Applies the one conservative move policy used by guide calculation, commit,
 * and resolved document projection. The returned elements are document-local
 * and must never be stored in canonical structural intent.
 */
export function getStructuralMoveLegality(
  element: HTMLElement,
  destination: { parent: HTMLElement; before: Node | null },
): StructuralMoveLegality {
  if (!element.isConnected) return { valid: false, reason: "target" };
  const sourceParent = element.parentElement;
  if (!sourceParent || !sourceParent.isConnected) return { valid: false, reason: "source-parent" };
  if (destination.parent.ownerDocument !== element.ownerDocument || !destination.parent.isConnected) {
    return { valid: false, reason: "destination-parent" };
  }

  let before: HTMLElement | null = null;
  if (destination.before !== null) {
    if (destination.before.nodeType !== 1
      || destination.before.ownerDocument !== element.ownerDocument
      || !destination.before.isConnected) {
      return { valid: false, reason: "anchor" };
    }
    // SAFETY: nodeType === 1 was checked above, so this is an HTMLElement in the destination document.
    before = destination.before as HTMLElement;
    if (before.parentElement !== destination.parent) return { valid: false, reason: "anchor" };
  }

  if (destination.parent === element || element.contains(destination.parent)) {
    return { valid: false, reason: "illegal-destination" };
  }
  const display = destination.parent.ownerDocument.defaultView?.getComputedStyle(destination.parent).display;
  if (display === "inline" || display === "contents"
    || isUnsupportedWrappedFlexRow(destination.parent)
    || !canContainElement(destination.parent, element)) {
    return { valid: false, reason: "illegal-destination" };
  }
  if (before === element) return { valid: false, reason: "anchor" };

  if (sourceParent === destination.parent
    && (before === element.nextElementSibling || (before === null && element.nextElementSibling === null))) {
    return { valid: false, reason: "illegal-destination" };
  }

  return {
    valid: true,
    sourceParent,
    destinationParent: destination.parent,
    before,
  };
}

export interface StructuralChangeDiagnostic extends StructuralProjectionReport {
  document: "Inspect" | `Canvas ${string}`;
}

interface AppliedDelete {
  kind: "delete";
  status: StructuralProjectionStatus;
  element: HTMLElement;
  placeholder: Comment;
  reason?: StructuralProjectionReason;
}

interface AppliedMove {
  kind: "move";
  status: StructuralProjectionStatus;
  element: HTMLElement;
  target: RenderedInstanceRef;
  fromParent: HTMLElement;
  fromBefore: Node | null;
  expectedParent: HTMLElement;
  expectedBefore: HTMLElement | null;
  reason?: StructuralProjectionReason;
}

interface UnresolvedStructuralChange {
  kind: "unresolved";
  status: "missing" | "ambiguous";
  reason: StructuralProjectionReason;
}

type AppliedStructuralChange = AppliedDelete | AppliedMove | UnresolvedStructuralChange;

interface DocumentProjectionState {
  applied: Map<string, AppliedStructuralChange>;
  /** Application order is required to reconstruct the source baseline safely. */
  appliedOrder: string[];
  /** The document-local controller snapshot used for later observer reports. */
  snapshot: StructuralChange[];
  snapshotKey: string | null;
  observer: MutationObserver | null;
  validationQueued: boolean;
}

interface CanvasReports {
  revision: number;
  reports: StructuralProjectionReport[];
}

let nextStructuralId = 1;
const documentStates = new Map<Document, DocumentProjectionState>();
let reportsByDocument = new WeakMap<Document, StructuralProjectionReport[]>();
const reportsByCanvasCard = new Map<string, CanvasReports>();
const diagnosticListeners = new Set<() => void>();
let diagnosticRevision = 0;

function notifyDiagnostics(): void {
  diagnosticRevision += 1;
  for (const listener of diagnosticListeners) listener();
}

function structuralId(): string {
  return `structural-${crypto.randomUUID?.() ?? nextStructuralId++}`;
}

function documentRoute(doc: Document): string | undefined {
  if (!doc.location) return undefined;
  try {
    const url = new URL(doc.location.href);
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function cloneSnapshot(snapshot: readonly StructuralChange[]): StructuralChange[] {
  // Structural changes are small JSON-safe records. Cloning their top-level
  // array is enough: no operation mutates a change or its nested references.
  return [...snapshot];
}

function projectStructuralChanges(snapshot: WorkspaceChangesSnapshot): void {
  reprojectKnownDocuments(snapshot.structuralChanges);
}

/** Captures a delete intent once, in the controller, at the user gesture. */
export function createStructuralDelete(element: HTMLElement, id = structuralId()): StructuralDelete | null {
  const target = captureRenderedInstance(element);
  if (!target) return null;
  const route = documentRoute(element.ownerDocument);
  const change: StructuralDelete = {
    id,
    kind: "delete",
    target,
    ...(route ? { route } : {}),
  };
  if (!workspaceChangeStore.commitStructuralChange(change)) return null;
  projectStructuralChanges(workspaceChangeStore.getSnapshot());
  return change;
}

/**
 * Capture a move only when every address can be represented by durable
 * rendered-instance references. Local DOM positions are deliberately never a
 * fallback: a missed preview is safer than moving the wrong item.
 */
export function createStructuralMove(
  element: HTMLElement,
  destination: { parent: HTMLElement; before: Node | null },
  id = structuralId(),
): StructuralMove | null {
  const legality = getStructuralMoveLegality(element, destination);
  if (!legality.valid) return null;
  const { sourceParent: sourceParentElement, destinationParent, before: beforeElement } = legality;

  const target = captureRenderedInstance(element);
  const sourceParent = captureRenderedInstance(sourceParentElement);
  const parent = captureRenderedInstance(destinationParent);
  const before = beforeElement ? captureRenderedInstance(beforeElement) : null;
  if (!target || !sourceParent || !parent || (beforeElement && !before)) return null;
  const sourceChildren = Array.from(sourceParentElement.children);
  const destinationChildren = Array.from(destinationParent.children);
  const fromIndex = sourceChildren.indexOf(element);
  const beforeIndex = beforeElement ? destinationChildren.indexOf(beforeElement) : destinationChildren.length;
  if (fromIndex < 0 || beforeIndex < 0) return null;
  const sameParent = sourceParentElement === destinationParent;
  const change: StructuralMove = {
    id,
    kind: "move",
    target,
    source: { parent: sourceParent },
    destination: { parent, before },
    presentation: {
      sourceParentTag: sourceParentElement.tagName.toLowerCase(),
      destinationParentTag: destinationParent.tagName.toLowerCase(),
      fromIndex,
      toIndex: beforeElement
        ? beforeIndex - (sameParent && fromIndex < beforeIndex ? 1 : 0)
        : destinationChildren.length - (sameParent ? 1 : 0),
    },
  };
  if (!workspaceChangeStore.commitStructuralChange(change)) return null;
  projectStructuralChanges(workspaceChangeStore.getSnapshot());
  return change;
}

export function getStructuralChanges(): readonly StructuralChange[] {
  return workspaceChangeStore.getSnapshot().structuralChanges;
}

export function getStructuralDeletes(): readonly StructuralDelete[] {
  return getStructuralChanges().filter((change): change is StructuralDelete => change.kind === "delete");
}

/** Revert removes one canonical intent and leaves every other intent intact. */
export function revertStructuralChange(changeId: string): boolean {
  const changed = workspaceChangeStore.revertStructuralChangeRecord(changeId);
  if (changed) projectStructuralChanges(workspaceChangeStore.getSnapshot());
  return changed;
}

/**
 * Removes source-verified structural intents without leaving an undo path that
 * can recreate their browser-only previews.
 *
 * Agent completion can verify a subset of one dispatched snapshot. The
 * remaining records and their useful history stay intact while every verified
 * ID is pruned from canonical state, undo/redo snapshots, and Canvas reports.
 */
export function reconcileVerifiedStructuralChanges(
  verifiedIds: ReadonlySet<string>,
): number {
  if (verifiedIds.size === 0) return 0;
  const removed = workspaceChangeStore.reconcileWorkspaceChanges(new Set(), verifiedIds);
  if (removed === 0) return 0;
  projectStructuralChanges(workspaceChangeStore.getSnapshot());
  for (const [cardId, canvasReports] of reportsByCanvasCard) {
    reportsByCanvasCard.set(cardId, {
      ...canvasReports,
      reports: canvasReports.reports.filter((report) => !verifiedIds.has(report.changeId)),
    });
  }
  notifyDiagnostics();
  return removed;
}

/** State changes drive controller-to-renderer projection. Diagnostics do not. */
export function subscribeStructuralChanges(listener: () => void): () => void {
  return workspaceChangeStore.subscribe(listener);
}

/** Compatibility name retained while the controller moved to a full union. */
export const subscribeStructuralDeletes = subscribeStructuralChanges;

/** Diagnostics change after host/frame resolution or a one-shot conflict check. */
export function subscribeStructuralDiagnostics(listener: () => void): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

/** Monotonic snapshot for React consumers of document-local diagnostics. */
export function getStructuralDiagnosticRevision(): number {
  return diagnosticRevision;
}

function getDocumentState(doc: Document): DocumentProjectionState {
  let state = documentStates.get(doc);
  if (state) return state;
  state = {
    applied: new Map(),
    appliedOrder: [],
    snapshot: [],
    snapshotKey: null,
    observer: null,
    validationQueued: false,
  };
  documentStates.set(doc, state);
  installDocumentObserver(doc, state);
  return state;
}

function installDocumentObserver(doc: Document, state: DocumentProjectionState): void {
  const viewWithObserver = doc.defaultView as ((Window & { MutationObserver?: typeof MutationObserver }) | null | undefined);
  const Observer = viewWithObserver?.MutationObserver
    ?? (typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
  if (!Observer || !doc.documentElement) return;
  state.observer = new Observer(() => scheduleValidation(doc, state));
  state.observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-cid", "data-src", "data-cprops", "aria-label"],
  });
}

function hasUnresolvedAppliedChange(state: DocumentProjectionState): boolean {
  for (const local of state.applied.values()) {
    if (local.kind === "unresolved") return true;
  }
  return false;
}

function scheduleValidation(doc: Document, state: DocumentProjectionState): void {
  if (state.validationQueued || state.applied.size === 0) return;
  state.validationQueued = true;
  queueMicrotask(() => {
    state.validationQueued = false;
    // A renderer can receive its projection before its application tree has
    // mounted. Retry unresolved records after that tree changes so a valid
    // late mount converges without requiring another controller message.
    if (hasUnresolvedAppliedChange(state)) {
      rebuildForSnapshot(doc, state, state.snapshot, false);
      // The replay is synchronous, so external renderer mutations cannot
      // interleave with it. Discard only the records produced by the replay;
      // future renderer mutations remain observed and can trigger another try.
      state.observer?.takeRecords();
      storeReports(doc, reportsForSnapshot(state, state.snapshot));
      return;
    }
    validateAppliedPreview(doc, state);
  });
}

function sameReports(a: readonly StructuralProjectionReport[], b: readonly StructuralProjectionReport[]): boolean {
  return a.length === b.length && a.every((report, index) =>
    report.changeId === b[index]?.changeId
      && report.status === b[index]?.status
      && report.reason === b[index]?.reason);
}

function storeReports(doc: Document, reports: StructuralProjectionReport[]): void {
  const before = reportsByDocument.get(doc) ?? [];
  reportsByDocument.set(doc, reports);
  if (!sameReports(before, reports)) notifyDiagnostics();
}

function reportsForSnapshot(state: DocumentProjectionState, snapshot: readonly StructuralChange[]): StructuralProjectionReport[] {
  return snapshot.map((change) => {
    const local = state.applied.get(change.id);
    const status = local?.status ?? "missing";
    return {
      changeId: change.id,
      status,
      ...(local && "reason" in local && local.reason ? { reason: local.reason } : {}),
    };
  });
}

function restoreApplied(local: AppliedStructuralChange): void {
  if (local.kind === "unresolved") return;
  if (local.kind === "delete") {
    // If React already replaced our placeholder, never reinsert the stale
    // detached node. The observer will (or already did) report overridden.
    if (local.placeholder.isConnected) local.placeholder.replaceWith(local.element);
    return;
  }
  if (!local.element.isConnected || !local.fromParent.isConnected) return;
  const anchor = local.fromBefore?.parentNode === local.fromParent ? local.fromBefore : null;
  local.fromParent.insertBefore(local.element, anchor);
}

function rebuildForSnapshot(
  doc: Document,
  state: DocumentProjectionState,
  snapshot: readonly StructuralChange[],
  schedulePostReplayValidation = true,
): void {
  // React may have changed a projected node before its mutation callback ran.
  // Validate synchronously so a rebuild never restores a framework-owned node.
  validateAppliedPreview(doc, state);

  const activeIds = new Set(snapshot.map((change) => change.id));
  const retainedOverrides = new Map<string, AppliedStructuralChange>();
  for (const [id, local] of state.applied) {
    if (local.status === "overridden" && activeIds.has(id)) retainedOverrides.set(id, local);
  }

  // Undo in reverse application order, reconstructing this document's source
  // baseline before replaying the desired canonical sequence. This is what
  // makes reverting an earlier move correct when later moves remain.
  for (const id of [...state.appliedOrder].reverse()) {
    const local = state.applied.get(id);
    if (local && local.status !== "overridden") restoreApplied(local);
  }
  state.applied = retainedOverrides;
  state.appliedOrder = [];
  state.snapshot = cloneSnapshot(snapshot);
  state.snapshotKey = JSON.stringify(snapshot);

  for (const change of snapshot) {
    const retained = state.applied.get(change.id);
    if (retained?.status === "overridden") continue;
    applyChangeToDocument(doc, state, change);
  }

  // Moves need to verify the final placement, after all later canonical
  // operations have replayed, rather than the transient first insertion.
  for (const local of state.applied.values()) {
    if (local.kind === "move" && local.status === "applied") {
      local.expectedParent = local.element.parentElement ?? local.expectedParent;
      // SAFETY: a move nextElementSibling is an HTMLElement when the move is still applied.
      local.expectedBefore = local.element.nextElementSibling as HTMLElement | null;
    }
  }
  if (schedulePostReplayValidation) scheduleValidation(doc, state);
}

function storeUnresolved(
  state: DocumentProjectionState,
  changeId: string,
  status: "missing" | "ambiguous",
  reason: StructuralProjectionReason,
): void {
  state.applied.set(changeId, { kind: "unresolved", status, reason });
}

function applyChangeToDocument(doc: Document, state: DocumentProjectionState, change: StructuralChange): void {
  const target = resolveRenderedInstance(doc, change.target);
  if (target.status !== "resolved") {
    storeUnresolved(state, change.id, target.status, "target");
    return;
  }

  if (change.kind === "delete") {
    const placeholder = doc.createComment("nudge-ui-deleted");
    target.element.replaceWith(placeholder);
    state.applied.set(change.id, { kind: "delete", status: "applied", element: target.element, placeholder });
    state.appliedOrder.push(change.id);
    return;
  }

  const sourceParent = resolveRenderedInstance(doc, change.source.parent);
  if (sourceParent.status !== "resolved") {
    storeUnresolved(state, change.id, sourceParent.status, "source-parent");
    return;
  }
  const parent = resolveRenderedInstance(doc, change.destination.parent);
  if (parent.status !== "resolved") {
    storeUnresolved(state, change.id, parent.status, "destination-parent");
    return;
  }
  const before = change.destination.before ? resolveRenderedInstance(doc, change.destination.before) : null;
  if (before && before.status !== "resolved") {
    storeUnresolved(state, change.id, before.status, "anchor");
    return;
  }
  if (target.element.parentElement !== sourceParent.element) {
    storeUnresolved(state, change.id, "missing", "source-parent");
    return;
  }
  const legality = getStructuralMoveLegality(target.element, {
    parent: parent.element,
    before: before?.element ?? null,
  });
  if (!legality.valid) {
    storeUnresolved(state, change.id, "missing", legality.reason);
    return;
  }
  const fromParent = legality.sourceParent;
  const fromBefore = target.element.nextSibling;
  legality.destinationParent.insertBefore(target.element, legality.before);
  state.applied.set(change.id, {
    kind: "move",
    status: "applied",
    element: target.element,
    target: change.target,
    fromParent,
    fromBefore,
    expectedParent: legality.destinationParent,
    // SAFETY: target.element was inserted into an HTMLElement, so its nextElementSibling is an HTMLElement when present.
    expectedBefore: target.element.nextElementSibling as HTMLElement | null,
  });
  state.appliedOrder.push(change.id);
}

function validationStatus(local: AppliedStructuralChange): StructuralProjectionStatus {
  if (local.kind === "unresolved") return local.status;
  if (local.status === "overridden") return "overridden";
  if (local.kind === "delete") return local.placeholder.isConnected ? "applied" : "overridden";
  return local.element.isConnected
    && local.element.parentElement === local.expectedParent
    && local.element.nextElementSibling === local.expectedBefore
    && matchesRenderedInstanceEvidence(local.element, local.target)
    ? "applied"
    : "overridden";
}

/** Rebuild already-mounted document adapters from canonical data only. */
function reprojectKnownDocuments(changes: readonly StructuralChange[] = getStructuralChanges()): void {
  for (const [doc, state] of documentStates) {
    rebuildForSnapshot(doc, state, changes);
    storeReports(doc, reportsForSnapshot(state, state.snapshot));
  }
}

function validateAppliedPreview(doc: Document, state: DocumentProjectionState): void {
  let changed = false;
  for (const local of state.applied.values()) {
    const status = validationStatus(local);
    if (status !== local.status) {
      local.status = status;
      if (status === "overridden") local.reason = "react-override";
      changed = true;
    }
  }
  if (!changed) return;
  storeReports(doc, reportsForSnapshot(state, state.snapshot));
}

/**
 * Apply one full controller snapshot to one document. Physical nodes and
 * placeholders stay in the document state only; history stays serializable in
 * the controller. A same snapshot never reapplies an overridden preview.
 */
export function applyStructuralProjection(
  doc: Document,
  snapshot: readonly StructuralChange[],
): StructuralProjectionReport[] {
  const state = getDocumentState(doc);
  const key = JSON.stringify(snapshot);
  if (state.snapshotKey !== key) rebuildForSnapshot(doc, state, snapshot);
  const reports = reportsForSnapshot(state, snapshot);
  storeReports(doc, reports);
  return reports;
}

/** Compatibility entry point for the delete-only 0050 callers. */
export function applyStructuralDeleteProjection(
  doc: Document,
  snapshot: readonly StructuralDelete[],
): StructuralProjectionReport[] {
  return applyStructuralProjection(doc, snapshot);
}

export function getStructuralProjectionReports(doc: Document): readonly StructuralProjectionReport[] {
  return reportsByDocument.get(doc) ?? [];
}

/**
 * Frames may report only their document-local outcome. The controller owns
 * these reports and filters them against its current canonical change set.
 */
export function recordCanvasStructuralProjectionReports(
  cardId: string,
  revision: number,
  reports: readonly StructuralProjectionReport[],
): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || !reports.every(isStructuralProjectionReport)) return;
  const expected = new Set(getStructuralChanges().map((change) => change.id));
  if (reports.length !== expected.size || new Set(reports.map((report) => report.changeId)).size !== reports.length
    || reports.some((report) => !expected.has(report.changeId))) return;
  const existing = reportsByCanvasCard.get(cardId);
  if (existing && revision < existing.revision) return;
  const next = reports.map((report) => ({ ...report }));
  if (existing && existing.revision === revision && sameReports(existing.reports, next)) return;
  reportsByCanvasCard.set(cardId, { revision, reports: next });
  notifyDiagnostics();
}

export function clearCanvasStructuralProjectionReports(cardId: string): void {
  if (!reportsByCanvasCard.delete(cardId)) return;
  notifyDiagnostics();
}

/** Removes document-local reports for canonical intents that no longer exist. */
export function pruneStructuralProjectionReports(changeIds: ReadonlySet<string>): void {
  if (changeIds.size === 0) return;
  for (const [cardId, canvasReports] of reportsByCanvasCard) {
    reportsByCanvasCard.set(cardId, {
      ...canvasReports,
      reports: canvasReports.reports.filter((report) => !changeIds.has(report.changeId)),
    });
  }
  notifyDiagnostics();
}

/** Clears reports before restoring or clearing an atomic workspace snapshot. */
export function clearStructuralProjectionReports(): void {
  reportsByCanvasCard.clear();
  reportsByDocument = new WeakMap();
  notifyDiagnostics();
}

export function getStructuralChangeDiagnostics(changeId: string): StructuralChangeDiagnostic[] {
  const diagnostics: StructuralChangeDiagnostic[] = [];
  const host = reportsByDocument.get(document)?.find((report) => report.changeId === changeId);
  if (host) diagnostics.push({ ...host, document: "Inspect" });
  for (const [cardId, entry] of reportsByCanvasCard) {
    const report = entry.reports.find((candidate) => candidate.changeId === changeId);
    if (report) diagnostics.push({ ...report, document: `Canvas ${cardId}` });
  }
  return diagnostics;
}


/** Controller teardown/test hook. It is not a user-visible history operation. */
export function resetStructuralDeleteProjection(): void {
  for (const state of documentStates.values()) {
    for (const id of [...state.appliedOrder].reverse()) {
      const local = state.applied.get(id);
      if (local && local.status !== "overridden") restoreApplied(local);
    }
    state.observer?.disconnect();
  }
  documentStates.clear();
  reportsByDocument = new WeakMap();
  reportsByCanvasCard.clear();
  nextStructuralId = 1;
  diagnosticRevision = 0;
  resetWorkspaceChanges();
  notifyDiagnostics();
}

/**
 * Releases one document's structural projection without touching canonical
 * workspace intent. Applied deletes/moves owned by this document are restored
 * and the document observer is disconnected; the controller snapshot stays
 * intact so a later remount can re-project from canonical state. Register as
 * a document-session cleanup alongside disposeBrowserCssInspection.
 */
export function releaseDocumentProjection(doc: Document): void {
  const state = documentStates.get(doc);
  if (!state) {
    if (reportsByDocument.delete(doc)) notifyDiagnostics();
    return;
  }
  for (const id of [...state.appliedOrder].reverse()) {
    const local = state.applied.get(id);
    if (local && local.status !== "overridden") restoreApplied(local);
  }
  state.observer?.disconnect();
  documentStates.delete(doc);
  reportsByDocument.delete(doc);
  notifyDiagnostics();
}
