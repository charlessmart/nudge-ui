import { changeKey, tokenReference } from "../changes/model.ts";
import { selectorForManagedChange } from "../changes/managedStyleProjection.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import {
  getChangesList,
  isComponentChange,
  isTextContentChange,
  isTokenChange,
  reconcileVerifiedWorkspaceChanges,
  type ChangeRecord,
  type PreviewableChangeRecord,
} from "../changes/changesLog.ts";
import { verifyPreview } from "../projection/managedStylesheet.ts";
import { resolveRenderedInstance } from "../projection/renderedInstance.ts";
import {
  getStructuralChanges,
  type StructuralChange,
  type StructuralDelete,
  type StructuralMove,
} from "../projection/structuralProjection.ts";
import {
  resolveTextProjectionTarget,
  resolveTextProjectionTextNode,
} from "../projection/textProjection.ts";
import {
  applyHostWorkspaceProjection,
  compileWorkspaceProjection,
} from "../projection/workspaceProjection.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import {
  isCanvasProjectionRevisionCurrent,
  projectWorkspaceSnapshotToDocument,
} from "../canvas/projection.ts";
import { getFocusedCardId, getSelectedCardId } from "../canvas/canvasStore.ts";
import { getSelectedElement } from "../selection/selectionStore.ts";
import { isEditorShellDocument } from "../runtime/editorShell.ts";

export interface HandoffSnapshot {
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
}

/**
 * User-facing agent completion state, named once.
 * "completed" means the agent finished; "verified" means completed work was
 * positively reconciled against source-rendered output.
 */
export type AgentCompletionStatus = "completed" | "verified";

const dispatches = new Map<number, HandoffSnapshot>();

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJsonValue(entry)]),
  );
}

function stableSerialized(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

/** Stable, preview-metadata-free identity for one prompt handoff record. */
export function handoffChangeFingerprint(change: ChangeRecord): string {
  return stableSerialized(change);
}

/** Stable identity for one structural record included in a prompt handoff. */
export function handoffStructuralFingerprint(change: StructuralChange): string {
  return stableSerialized(change);
}

function requestedStyleValue(change: PreviewableChangeRecord): string {
  if (isTokenChange(change)) return change.rawValue;
  if (change.newToken) return tokenReference(change.newToken);
  return change.rawValue ?? "";
}

function verifyStyle(change: PreviewableChangeRecord, doc: Document): boolean {
  if (!isTokenChange(change) && (change.state ?? "base") !== "base") return false;
  const selector = selectorForManagedChange(change);
  if (!selector) return false;
  let targets: HTMLElement[];
  try {
    targets = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  } catch {
    return false;
  }
  const requested = requestedStyleValue(change);
  return requested.length > 0
    && targets.length > 0
    && targets.every((target) => verifyPreview(target, change.property, requested).status === "applied");
}

function verifyText(change: Extract<ChangeRecord, { kind: "text-content" }>, doc: Document): boolean {
  const resolved = resolveTextProjectionTarget(doc, change.target, change.after);
  if (resolved.status !== "resolved") return false;
  const node = resolveTextProjectionTextNode(resolved.element, change.target, change.after);
  if (node) return node.nodeValue === change.after;
  return change.target.textNodePath === undefined
    && change.after.length === 0
    && (resolved.element.textContent ?? "") === "";
}

/**
 * A delete verifies when its target no longer resolves in the document once
 * the preview is lifted: the source really removed it. Ambiguous evidence
 * still means identical elements are present, so only a definitive miss
 * verifies.
 */
function verifyStructuralDelete(change: StructuralDelete, doc: Document): boolean {
  // A miss cannot prove that this document renders the route where the delete
  // was authored. Keep the change until route applicability is durable data.
  void change;
  void doc;
  return false;
}

/**
 * A move verifies when the element sits at its recorded destination without
 * the preview holding it there. The projection rebuild returns a cleanly
 * applied move preview to its captured origin, so such records conservatively
 * stay unverified instead of trusting rendered placement alone.
 */
function verifyStructuralMove(change: StructuralMove, doc: Document): boolean {
  const target = resolveRenderedInstance(doc, change.target);
  if (target.status !== "resolved") return false;
  const parent = resolveRenderedInstance(doc, change.destination.parent);
  if (parent.status !== "resolved") return false;
  if (target.element.parentElement !== parent.element) return false;
  if (!change.destination.before) return target.element.nextElementSibling === null;
  const before = resolveRenderedInstance(doc, change.destination.before);
  return before.status === "resolved" && target.element.nextElementSibling === before.element;
}

function verifiedStructuralChangeIds(
  eligible: readonly StructuralChange[],
  doc: Document,
): Set<string> {
  const verified = new Set<string>();
  for (const change of eligible) {
    const applied = change.kind === "delete"
      ? verifyStructuralDelete(change, doc)
      : verifyStructuralMove(change, doc);
    if (applied) verified.add(change.id);
  }
  return verified;
}

/**
 * Positively verifies browser-observable source results after the inspector's
 * own projections have been removed. Component props and interaction states
 * intentionally remain unresolved because rendered output alone cannot prove
 * that their source was updated.
 */
export function verifiedChangeKeys(
  sentChanges: readonly ChangeRecord[],
  doc: Document = document,
): Set<string> {
  const verified = new Set<string>();
  for (const change of sentChanges) {
    if (isComponentChange(change)) continue;
    const applied = isTextContentChange(change)
      ? verifyText(change, doc)
      : verifyStyle(change, doc);
    if (applied) verified.add(changeKey(change));
  }
  return verified;
}

/** Captures the exact canonical edits associated with one dispatched prompt. */
export function recordAgentDispatch(
  revision: number,
  changes: readonly ChangeRecord[],
  structuralChanges: readonly StructuralChange[] = [],
): void {
  dispatches.set(revision, {
    changes: changes.map((change) => structuredClone(change)),
    structuralChanges: structuralChanges.map((change) => structuredClone(change)),
  });
}

/** Drops a captured revision when the bridge rejects its dispatch. */
export function discardAgentDispatch(revision: number): void {
  dispatches.delete(revision);
}

/** Returns how many canonical edits were in flight for one dispatch. */
export function getAgentDispatchSize(revision: number): number {
  const snapshot = dispatches.get(revision);
  if (!snapshot) return 0;
  return snapshot.changes.length + snapshot.structuralChanges.length;
}

function afterBrowserPaint(doc: Document): Promise<void> {
  const ownerWindow = doc.defaultView;
  const requestFrame = ownerWindow?.requestAnimationFrame.bind(ownerWindow);
  if (!ownerWindow || !requestFrame) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(finish, 250);
    requestFrame(() => {
      if (doc.defaultView !== ownerWindow) return finish();
      requestFrame(finish);
    });
  });
}

/**
 * Reconciles only records that still equal the sent snapshot and that remain
 * observable after removing Nudge's own preview. Newer edits and ambiguous
 * records are preserved.
 */
export async function verifyAndReconcileHandoff(
  snapshot: HandoffSnapshot,
  doc: Document | null = activeVerificationDocument(),
): Promise<number> {
  if (!doc) return 0;
  const applyProjection = async (
    snapshot: Parameters<typeof compileWorkspaceProjection>[0],
  ): Promise<number | "host" | null> => {
    if (doc === document && !isEditorShellDocument(doc)) {
      applyHostWorkspaceProjection(compileWorkspaceProjection(snapshot));
      return "host";
    }
    if (doc === document) return null;
    return projectWorkspaceSnapshotToDocument(doc, snapshot);
  };
  const sentByKey = new Map(
    snapshot.changes.map((change) => [changeKey(change), handoffChangeFingerprint(change)]),
  );
  const current = getChangesList();
  const eligible = current.filter(
    (change) => sentByKey.get(changeKey(change)) === handoffChangeFingerprint(change),
  );
  const eligibleKeys = new Set(eligible.map(changeKey));
  const remaining = current.filter((change) => !eligibleKeys.has(changeKey(change)));

  // The same "still unchanged" rule for structural intent: only canonical
  // records byte-identical to the dispatched snapshot may be reconciled.
  const sentStructural = new Map(
    snapshot.structuralChanges.map((change) => [change.id, handoffStructuralFingerprint(change)]),
  );
  const currentStructural = getStructuralChanges();
  const eligibleStructural = currentStructural.filter(
    (change) => sentStructural.get(change.id) === handoffStructuralFingerprint(change),
  );
  const eligibleStructuralIds = new Set(eligibleStructural.map((change) => change.id));
  const remainingStructural = currentStructural.filter((change) => !eligibleStructuralIds.has(change.id));

  try {
    const currentWorkspace = getWorkspaceChanges();
    const previewRevision = await applyProjection({
      revision: currentWorkspace.revision,
      changes: remaining,
      structuralChanges: remainingStructural,
    });
    if (previewRevision === null) return 0;
    await afterBrowserPaint(doc);
    if (typeof previewRevision === "number"
      && !isCanvasProjectionRevisionCurrent(doc, previewRevision)) return 0;
    const verified = verifiedChangeKeys(eligible, doc);
    const verifiedStructural = verifiedStructuralChangeIds(eligibleStructural, doc);
    // A user can make another inspector edit while the two-frame verification
    // window is open. Recheck byte identity immediately before reconciliation
    // so a newer value at the same key can never be removed.
    const currentByKey = new Map(
      getChangesList().map((change) => [changeKey(change), handoffChangeFingerprint(change)]),
    );
    const stillVerified = new Set(
      [...verified].filter((key) => currentByKey.get(key) === sentByKey.get(key)),
    );
    const currentStructuralById = new Map(
      getStructuralChanges().map((change) => [change.id, handoffStructuralFingerprint(change)]),
    );
    const stillVerifiedStructural = new Set(
      [...verifiedStructural].filter(
        (id) => currentStructuralById.get(id) === sentStructural.get(id),
      ),
    );
    if (typeof previewRevision === "number"
      && !isCanvasProjectionRevisionCurrent(doc, previewRevision)) return 0;
    return reconcileVerifiedWorkspaceChanges(stillVerified, stillVerifiedStructural);
  } finally {
    // Reconciliation reapplies the canonical set. If it was unable to write
    // (for example, a read-only Canvas lease), restore the untouched set here.
    const canonicalWorkspace = getWorkspaceChanges();
    await applyProjection(canonicalWorkspace);
  }
}

function activeVerificationDocument(): Document | null {
  const selectedDocument = getSelectedElement()?.domElement.ownerDocument;
  if (selectedDocument && selectedDocument !== document) return selectedDocument;
  const selectedCardId = getSelectedCardId();
  const selectedFrame = selectedCardId
    ? getRegisteredFrames().get(selectedCardId)
    : undefined;
  try {
    if (selectedFrame?.contentDocument) return selectedFrame.contentDocument;
  } catch {
    // Continue to another same-origin preview.
  }
  const focusedCardId = getFocusedCardId();
  const focusedFrame = focusedCardId ? getRegisteredFrames().get(focusedCardId) : undefined;
  try {
    if (focusedFrame?.contentDocument) return focusedFrame.contentDocument;
  } catch {
    // Continue to another same-origin preview.
  }
  for (const frame of getRegisteredFrames().values()) {
    try {
      if (frame.contentDocument) return frame.contentDocument;
    } catch {
      // Cross-origin previews cannot provide browser-verifiable evidence.
    }
  }
  return isEditorShellDocument() ? null : document;
}

/** Reconciles the captured records for one completed connected-agent request. */
export async function verifyAndReconcileAgentDispatch(revision: number): Promise<number> {
  const snapshot = dispatches.get(revision);
  if (!snapshot) return 0;
  dispatches.delete(revision);
  return verifyAndReconcileHandoff(snapshot);
}

/** Test/session reset for in-memory dispatch snapshots. */
export function resetAgentVerification(): void {
  dispatches.clear();
}
