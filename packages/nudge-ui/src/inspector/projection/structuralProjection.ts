import type { FrameProjection } from "../canvas/projection.ts";
import {
  commitStructuralChange,
  getActiveDraftChanges,
  getDraftChanges,
  revertStructuralChange as revertDraftStructuralChange,
  subscribeActiveDraftChanges,
} from "../drafts/store.ts";
import {
  captureRenderedInstance,
  captureStructuralTarget,
  matchesRenderedInstanceEvidence,
  resolveRenderedInstance,
} from "./renderedInstance.ts";
import type { RenderedInstanceRef } from "../changes/editModel.ts";
import { isStructuralProjectionReport } from "./structuralProjectionBoundary.ts";
import { childrenSlotInvocation, sourceSlotInvocation } from "./childrenSlot.ts";
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

/** Canonical intent carries no DOM node, placeholder, or renderer-local identity; each document keeps its own preview artefacts. */
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

/** Returned elements are document-local and must never be stored in canonical intent. */
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
  if (display === "inline" || !canContainElement(destination.parent, element)) {
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
  snapshot: StructuralChange[];
  snapshotKey: string | null;
  observer: MutationObserver | null;
  validationQueued: boolean;
}

interface CanvasReports {
  draftId: string;
  draftRevision: number;
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

/** JSON-safe projection of history state; values JSON cannot hold become strings so the key stays stable. */
type StableStateValue = null | boolean | number | string | StableStateValue[] | { [key: string]: StableStateValue };

function stableStateValue(value: unknown, seen = new WeakSet<object>()): StableStateValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => stableStateValue(entry, seen));
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableStateValue(entry, seen)]),
  );
}

function textWithoutExcluded(element: HTMLElement, excluded?: HTMLElement): string | null {
  let text = "";
  const visit = (node: Node): void => {
    if (node === excluded) return;
    if (node.nodeType === node.TEXT_NODE) {
      text += node.nodeValue ?? "";
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(element);
  return text.replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

function renderedInstanceState(doc: Document, excluded?: HTMLElement): unknown[] | undefined {
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>("[data-cid][data-src]"))
      .filter((element) => element !== excluded && !excluded?.contains(element))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        cid: element.getAttribute("data-cid"),
        src: element.getAttribute("data-src"),
        props: element.getAttribute("data-cprops"),
        text: textWithoutExcluded(element, excluded),
        ariaLabel: element.getAttribute("aria-label"),
      }));
  } catch {
    return undefined;
  }
}

/** Returns bounded view state used to verify a delete in the same rendered view. */
export function documentStateKey(doc: Document, excluded?: HTMLElement): string | undefined {
  const view = doc.defaultView;
  if (!view || !doc.location) return undefined;
  try {
    const url = new URL(doc.location.href);
    const rendered = renderedInstanceState(doc, excluded);
    if (!rendered) return undefined;
    const state = JSON.stringify({
      hash: url.hash,
      history: stableStateValue(view.history.state),
      rendered,
    });
    return state.length <= 4096 ? state : undefined;
  } catch {
    return undefined;
  }
}

function cloneSnapshot(snapshot: readonly StructuralChange[]): StructuralChange[] {
  // Shallow clone is enough: no operation mutates a change or its nested references.
  return [...snapshot];
}

/** The Draft store already re-projected the host; this covers every other known document. */
function projectStructuralChanges(): void {
  const changes = getStructuralChanges();
  for (const doc of documentStates.keys()) applyStructuralProjection(doc, changes);
}

export function createStructuralDelete(element: HTMLElement, id = structuralId()): StructuralDelete | null {
  const target = captureStructuralTarget(element);
  if (!target) return null;
  const route = documentRoute(element.ownerDocument);
  const state = documentStateKey(element.ownerDocument, element);
  const change: StructuralDelete = {
    id,
    kind: "delete",
    target,
    ...(route ? { route } : {}),
    ...(state ? { state } : {}),
  };
  if (!commitStructuralChange(change)) return null;
  projectStructuralChanges();
  return change;
}

/** Children ordered by distance from `index`, so slot inference prefers the neighbours of a position. */
function nearestFirst(children: readonly Element[], index: number): Element[] {
  return children
    .map((child, position) => ({ child, distance: Math.abs(position - index) }))
    .sort((left, right) => left.distance - right.distance)
    .map(({ child }) => child);
}

/** Local DOM positions are never a fallback: a missed preview beats moving the wrong item. */
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
  const sourceChildrenOf = sourceSlotInvocation(sourceParentElement, element);
  const destinationChildrenOf = childrenSlotInvocation(
    destinationParent,
    nearestFirst(destinationChildren, beforeIndex).filter((child) => child !== element),
  );
  const change: StructuralMove = {
    id,
    kind: "move",
    target,
    source: { parent: sourceParent, ...(sourceChildrenOf ? { childrenOf: sourceChildrenOf } : {}) },
    destination: { parent, before, ...(destinationChildrenOf ? { childrenOf: destinationChildrenOf } : {}) },
    presentation: {
      sourceParentTag: sourceParentElement.tagName.toLowerCase(),
      destinationParentTag: destinationParent.tagName.toLowerCase(),
      fromIndex,
      toIndex: beforeElement
        ? beforeIndex - (sameParent && fromIndex < beforeIndex ? 1 : 0)
        : destinationChildren.length - (sameParent ? 1 : 0),
    },
  };
  if (!commitStructuralChange(change)) return null;
  projectStructuralChanges();
  return change;
}

export function getStructuralChanges(): readonly StructuralChange[] {
  return getActiveDraftChanges().structuralChanges;
}

export function getStructuralDeletes(): readonly StructuralDelete[] {
  return getStructuralChanges().filter((change): change is StructuralDelete => change.kind === "delete");
}

export function revertStructuralChange(changeId: string): boolean {
  const changed = revertDraftStructuralChange(changeId);
  if (changed) projectStructuralChanges();
  return changed;
}

/** State changes drive controller-to-renderer projection. Diagnostics do not. */
export function subscribeStructuralChanges(listener: () => void): () => void {
  return subscribeActiveDraftChanges(listener);
}

export function subscribeStructuralDiagnostics(listener: () => void): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

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
  // SAFETY: attaches are read from the document's own realm so cross-origin frames use their own MutationObserver.
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
    // Retry unresolved records when the tree changes so a late-mounting renderer converges without another controller message.
    if (hasUnresolvedAppliedChange(state)) {
      rebuildForSnapshot(doc, state, state.snapshot, false);
      // The replay is synchronous, so discarding its records only drops the replay's own mutations.
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
    // Never reinsert a stale detached node when React already replaced our placeholder.
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
  // React may have changed a projected node before its mutation callback ran; validate before rebuilding.
  validateAppliedPreview(doc, state);

  const activeIds = new Set(snapshot.map((change) => change.id));
  const retainedOverrides = new Map<string, AppliedStructuralChange>();
  for (const [id, local] of state.applied) {
    if (local.status === "overridden" && activeIds.has(id)) retainedOverrides.set(id, local);
  }

  // Undo in reverse order to reconstruct the source baseline; this is what makes reverting an earlier move correct when later moves remain.
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

  // Verify the final placement after all later canonical operations replayed, not the transient first insertion.
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

/** Physical nodes stay document-local; an unchanged snapshot never reapplies an overridden preview. */
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

/** Compatibility entry point for delete-only callers. */
export function applyStructuralDeleteProjection(
  doc: Document,
  snapshot: readonly StructuralDelete[],
): StructuralProjectionReport[] {
  return applyStructuralProjection(doc, snapshot);
}

export function getStructuralProjectionReports(doc: Document): readonly StructuralProjectionReport[] {
  return reportsByDocument.get(doc) ?? [];
}

/** Frames report document-local outcomes; the controller filters them against its canonical change set. */
export function recordCanvasStructuralProjectionReports(
  cardId: string,
  revision: number,
  reports: readonly StructuralProjectionReport[],
  projection?: FrameProjection,
): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || !reports.every(isStructuralProjectionReport)) return;
  const expected = projection ? new Set(projection.structuralChanges.map((record) => record.id)) : new Set(getStructuralChanges().map((change) => change.id));
  if (reports.length !== expected.size || new Set(reports.map((report) => report.changeId)).size !== reports.length
    || reports.some((report) => !expected.has(report.changeId))) return;
  const existing = reportsByCanvasCard.get(cardId);
  if (existing && revision < existing.revision) return;
  const next = reports.map((report) => ({ ...report }));
  if (existing && existing.revision === revision && sameReports(existing.reports, next)) return;
  const current = getActiveDraftChanges();
  reportsByCanvasCard.set(cardId, { revision, reports: next, draftId: projection?.draftId ?? current.draftId, draftRevision: projection?.draftRevision ?? current.revision });
  notifyDiagnostics();
}

export function clearCanvasStructuralProjectionReports(cardId: string): void {
  if (!reportsByCanvasCard.delete(cardId)) return;
  notifyDiagnostics();
}

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
    if (entry.draftId !== getActiveDraftChanges().draftId || entry.draftRevision !== getDraftChanges(entry.draftId).revision) continue;
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
  notifyDiagnostics();
}

/** Restores this document's previews and disconnects its observer; canonical intent stays intact for a later remount. */
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
