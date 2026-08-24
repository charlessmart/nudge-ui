import {
  captureRenderedInstance,
  matchesRenderedInstanceEvidence,
  resolveRenderedInstance,
  type RenderedInstanceRef,
} from "./renderedInstance.ts";
import {
  isStructuralChange,
  isStructuralDelete,
  isStructuralMove,
  isStructuralProjectionReport,
} from "./structuralProjectionBoundary.ts";

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
export interface StructuralDelete {
  id: string;
  kind: "delete";
  target: RenderedInstanceRef;
}

/** A serializable, controller-owned same-parent sibling insertion intent. */
export interface StructuralMove {
  id: string;
  kind: "move";
  target: RenderedInstanceRef;
  destination: {
    parent: RenderedInstanceRef;
    before: RenderedInstanceRef | null;
  };
  /** Presentation-only context; durable resolution uses the references above. */
  presentation: {
    parentTag: string;
    fromIndex: number;
    toIndex: number;
  };
}

export type StructuralChange = StructuralDelete | StructuralMove;
export type StructuralProjectionStatus = "applied" | "missing" | "ambiguous" | "overridden";

export interface StructuralProjectionReport {
  changeId: string;
  status: StructuralProjectionStatus;
}

export interface StructuralChangeDiagnostic extends StructuralProjectionReport {
  document: "Inspect" | `Canvas ${string}`;
}

interface AppliedDelete {
  kind: "delete";
  status: StructuralProjectionStatus;
  element: HTMLElement;
  placeholder: Comment;
}

interface AppliedMove {
  kind: "move";
  status: StructuralProjectionStatus;
  element: HTMLElement;
  target: RenderedInstanceRef;
  fromParent: HTMLElement;
  fromBefore: Node | null;
  expectedBefore: HTMLElement | null;
}

interface UnresolvedStructuralChange {
  kind: "unresolved";
  status: "missing" | "ambiguous";
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

interface HistoryEntry {
  before: StructuralChange[];
  after: StructuralChange[];
}

interface CanvasReports {
  revision: number;
  reports: StructuralProjectionReport[];
}

let nextStructuralId = 1;
let changes: StructuralChange[] = [];
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
const documentStates = new Map<Document, DocumentProjectionState>();
let reportsByDocument = new WeakMap<Document, StructuralProjectionReport[]>();
const reportsByCanvasCard = new Map<string, CanvasReports>();
const stateListeners = new Set<() => void>();
const diagnosticListeners = new Set<() => void>();
let diagnosticRevision = 0;

function notifyState(): void {
  for (const listener of stateListeners) listener();
}

function notifyDiagnostics(): void {
  diagnosticRevision += 1;
  for (const listener of diagnosticListeners) listener();
}

function structuralId(): string {
  return `structural-${crypto.randomUUID?.() ?? nextStructuralId++}`;
}

function cloneSnapshot(snapshot: readonly StructuralChange[]): StructuralChange[] {
  // Structural changes are small JSON-safe records. Cloning their top-level
  // array is enough: no operation mutates a change or its nested references.
  return [...snapshot];
}

function setChanges(next: StructuralChange[], history: HistoryEntry | null): void {
  changes = next;
  if (history) {
    undoStack.push(history);
    redoStack.length = 0;
  }
  reprojectKnownDocuments();
  notifyState();
}

/** Captures a delete intent once, in the controller, at the user gesture. */
export function createStructuralDelete(element: HTMLElement, id = structuralId()): StructuralDelete | null {
  const target = captureRenderedInstance(element);
  if (!target) return null;
  const change: StructuralDelete = { id, kind: "delete", target };
  const before = cloneSnapshot(changes);
  setChanges([...changes, change], { before, after: [...changes, change] });
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
  if (!element.isConnected || element.parentElement !== destination.parent) return null;
  if (destination.before && destination.before.nodeType !== 1) return null;
  // SAFETY: destination.before.nodeType === 1 was checked above, so it is an HTMLElement.
  const beforeElement = destination.before as HTMLElement | null;
  if (beforeElement && (beforeElement.parentElement !== destination.parent || beforeElement === element)) return null;

  const target = captureRenderedInstance(element);
  const parent = captureRenderedInstance(destination.parent);
  const before = beforeElement ? captureRenderedInstance(beforeElement) : null;
  if (!target || !parent || (beforeElement && !before)) return null;
  const children = Array.from(destination.parent.children);
  const fromIndex = children.indexOf(element);
  const beforeIndex = beforeElement ? children.indexOf(beforeElement) : children.length;
  if (fromIndex < 0 || beforeIndex < 0) return null;
  const change: StructuralMove = {
    id,
    kind: "move",
    target,
    destination: { parent, before },
    presentation: {
      parentTag: destination.parent.tagName.toLowerCase(),
      fromIndex,
      toIndex: beforeElement
        ? beforeIndex - (fromIndex < beforeIndex ? 1 : 0)
        : children.length - 1,
    },
  };
  const beforeSnapshot = cloneSnapshot(changes);
  const after = [...changes, change];
  setChanges(after, { before: beforeSnapshot, after: cloneSnapshot(after) });
  return change;
}

export function getStructuralChanges(): readonly StructuralChange[] {
  return changes;
}

export function getStructuralDeletes(): readonly StructuralDelete[] {
  return changes.filter((change): change is StructuralDelete => change.kind === "delete");
}

/** Revert removes one canonical intent and leaves every other intent intact. */
export function revertStructuralChange(changeId: string): boolean {
  const after = changes.filter((change) => change.id !== changeId);
  if (after.length === changes.length) return false;
  const before = cloneSnapshot(changes);
  setChanges(after, { before, after: cloneSnapshot(after) });
  return true;
}

/** Undo/redo histories contain snapshots of serializable canonical intent only. */
export function undoStructuralChange(): boolean {
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack.pop();
  changes = cloneSnapshot(entry.before);
  redoStack.push(entry);
  reprojectKnownDocuments();
  notifyState();
  return true;
}

export function redoStructuralChange(): boolean {
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack.pop();
  changes = cloneSnapshot(entry.after);
  undoStack.push(entry);
  reprojectKnownDocuments();
  notifyState();
  return true;
}

/** Clear is deliberately terminal: it restores the empty desired snapshot and history. */
export function clearStructuralChanges(): void {
  changes = [];
  undoStack.length = 0;
  redoStack.length = 0;
  // Frame reports are document-local diagnostics for an old desired snapshot.
  // They must not outlive the canonical records they describe.
  reportsByCanvasCard.clear();
  reprojectKnownDocuments();
  notifyState();
  notifyDiagnostics();
}

/**
 * Replaces canonical structural intent from a durable session. Hydration is
 * deliberately not an edit: it resets undo/redo and clears stale renderer
 * diagnostics before replaying the snapshot into every mounted document.
 */
export function hydrateStructuralChanges(snapshot: readonly StructuralChange[]): void {
  if (!snapshot.every(isStructuralChange)) return;
  changes = cloneSnapshot(snapshot);
  undoStack.length = 0;
  redoStack.length = 0;
  reportsByCanvasCard.clear();
  reprojectKnownDocuments();
  // Session startup has no existing document adapter yet. Register and replay
  // the host explicitly so restore behaves the same as a later Canvas frame.
  if (typeof document !== "undefined") applyStructuralProjection(document, changes);
  notifyState();
  notifyDiagnostics();
}

/** State changes drive controller-to-renderer projection. Diagnostics do not. */
export function subscribeStructuralChanges(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
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
  const Observer = doc.defaultView?.MutationObserver;
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

function scheduleValidation(doc: Document, state: DocumentProjectionState): void {
  if (state.validationQueued || state.applied.size === 0) return;
  state.validationQueued = true;
  queueMicrotask(() => {
    state.validationQueued = false;
    validateAppliedPreview(doc, state);
  });
}

function sameReports(a: readonly StructuralProjectionReport[], b: readonly StructuralProjectionReport[]): boolean {
  return a.length === b.length && a.every((report, index) =>
    report.changeId === b[index]?.changeId && report.status === b[index]?.status);
}

function storeReports(doc: Document, reports: StructuralProjectionReport[]): void {
  const before = reportsByDocument.get(doc) ?? [];
  reportsByDocument.set(doc, reports);
  if (!sameReports(before, reports)) notifyDiagnostics();
}

function reportsForSnapshot(state: DocumentProjectionState, snapshot: readonly StructuralChange[]): StructuralProjectionReport[] {
  return snapshot.map((change) => ({
    changeId: change.id,
    status: state.applied.get(change.id)?.status ?? "missing",
  }));
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
): void {
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
      // SAFETY: a move nextElementSibling is an HTMLElement when the move is still applied.
      local.expectedBefore = local.element.nextElementSibling as HTMLElement | null;
    }
  }
  scheduleValidation(doc, state);
}

function storeUnresolved(
  state: DocumentProjectionState,
  changeId: string,
  status: "missing" | "ambiguous",
): void {
  state.applied.set(changeId, { kind: "unresolved", status });
}

function applyChangeToDocument(doc: Document, state: DocumentProjectionState, change: StructuralChange): void {
  const target = resolveRenderedInstance(doc, change.target);
  if (target.status !== "resolved") {
    storeUnresolved(state, change.id, target.status);
    return;
  }

  if (change.kind === "delete") {
    const placeholder = doc.createComment("design-tool-deleted");
    target.element.replaceWith(placeholder);
    state.applied.set(change.id, { kind: "delete", status: "applied", element: target.element, placeholder });
    state.appliedOrder.push(change.id);
    return;
  }

  const parent = resolveRenderedInstance(doc, change.destination.parent);
  if (parent.status !== "resolved") {
    storeUnresolved(state, change.id, parent.status);
    return;
  }
  const before = change.destination.before ? resolveRenderedInstance(doc, change.destination.before) : null;
  if (before && before.status !== "resolved") {
    storeUnresolved(state, change.id, before.status);
    return;
  }
  if (target.element.parentElement !== parent.element || target.element === parent.element || target.element.contains(parent.element)
    || (before && before.element.parentElement !== parent.element)
    || (before && before.element === target.element)) {
    storeUnresolved(state, change.id, "missing");
    return;
  }
  const fromParent = target.element.parentElement;
  if (!fromParent) return;
  const fromBefore = target.element.nextSibling;
  parent.element.insertBefore(target.element, before?.element ?? null);
  state.applied.set(change.id, {
    kind: "move",
    status: "applied",
    element: target.element,
    target: change.target,
    fromParent,
    fromBefore,
    // SAFETY: target.element was inserted before a parent element, so its nextElementSibling is an HTMLElement when present.
    expectedBefore: target.element.nextElementSibling as HTMLElement | null,
  });
  state.appliedOrder.push(change.id);
}

function validationStatus(local: AppliedStructuralChange): StructuralProjectionStatus {
  if (local.kind === "unresolved") return local.status;
  if (local.status === "overridden") return "overridden";
  if (local.kind === "delete") return local.placeholder.isConnected ? "applied" : "overridden";
  return local.element.isConnected
    // Moves restore to the same parent they were recorded from (the record
    // guard rejects cross-parent moves), so validity is "element still sits
    // where we left it under that parent".
    && local.element.parentElement === local.fromParent
    && local.element.nextElementSibling === local.expectedBefore
    && matchesRenderedInstanceEvidence(local.element, local.target)
    ? "applied"
    : "overridden";
}

/** Rebuild already-mounted document adapters from canonical data only. */
function reprojectKnownDocuments(): void {
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
  const expected = new Set(changes.map((change) => change.id));
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
  changes = [];
  undoStack = [];
  redoStack = [];
  documentStates.clear();
  reportsByDocument = new WeakMap();
  reportsByCanvasCard.clear();
  nextStructuralId = 1;
  diagnosticRevision = 0;
  notifyState();
  notifyDiagnostics();
}
