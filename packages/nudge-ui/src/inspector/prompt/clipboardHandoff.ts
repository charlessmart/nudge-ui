import { changeKey } from "../changes/model.ts";
import type { ChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { getDraftWorkspace, getWorkspaceChanges, subscribeWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { documentRevisions, subscribeDocumentRevision } from "../tokens/resolution/cssomCollector.ts";
import {
  captureHandoffOwner,
  handoffChangeFingerprint,
  handoffStructuralFingerprint,
  verifyAndReconcileHandoff,
  type HandoffOwner,
} from "../agent/verification.ts";
import { isDraftTarget } from "../drafts/model.ts";

export interface ClipboardHandoffFingerprint {
  readonly key: string;
  readonly fingerprint: string;
}

interface ClipboardDraftHandoff {
  readonly owner: HandoffOwner;
  readonly changes: readonly ClipboardHandoffFingerprint[];
  readonly structuralChanges: readonly ClipboardHandoffFingerprint[];
}

export interface ClipboardHandoffSnapshot {
  readonly drafts: readonly ClipboardDraftHandoff[];
}

const checkpoints = new Map<string, ClipboardDraftHandoff>();
let revision = 0;
const reconciledCounts = new Map<string, number>();
const listeners = new Set<() => void>();

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function isFingerprint(value: unknown): value is ClipboardHandoffFingerprint {
  if (!value || typeof value !== "object") return false;
  const entry = value as ClipboardHandoffFingerprint;
  return typeof entry.key === "string" && entry.key.length > 0 && entry.key.length <= 16_384
    && typeof entry.fingerprint === "string" && entry.fingerprint.length > 0 && entry.fingerprint.length <= 1_048_576;
}

export function isClipboardHandoffSnapshot(value: unknown): value is ClipboardHandoffSnapshot | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const snapshot = value as ClipboardHandoffSnapshot;
  if (!Array.isArray(snapshot.drafts) || snapshot.drafts.length > 512) return false;
  const ids = new Set<string>();
  for (const draft of snapshot.drafts) {
    const owner = draft?.owner;
    if (!owner || typeof owner.draftId !== "string" || ids.has(owner.draftId)
      || !Number.isSafeInteger(owner.draftRevision) || owner.draftRevision < 0 || !isDraftTarget(owner.target)
      || !Array.isArray(owner.frameIds) || owner.frameIds.some((id: unknown) => typeof id !== "string")
      || !Array.isArray(draft.changes) || !Array.isArray(draft.structuralChanges)
      || draft.changes.length + draft.structuralChanges.length > 10_000
      || !draft.changes.every(isFingerprint) || !draft.structuralChanges.every(isFingerprint)
      || new Set(draft.changes.map((entry: ClipboardHandoffFingerprint) => entry.key)).size !== draft.changes.length
      || new Set(draft.structuralChanges.map((entry: ClipboardHandoffFingerprint) => entry.key)).size !== draft.structuralChanges.length) return false;
    ids.add(owner.draftId);
  }
  return true;
}

function fingerprintSnapshot(owner: HandoffOwner, changes: readonly ChangeRecord[], structuralChanges: readonly StructuralChange[]): ClipboardDraftHandoff {
  return {
    owner: structuredClone(owner),
    changes: changes.map((change) => ({ key: changeKey(change), fingerprint: handoffChangeFingerprint(change) })),
    structuralChanges: structuralChanges.map((change) => ({ key: change.id, fingerprint: handoffStructuralFingerprint(change) })),
  };
}

export function recordClipboardHandoff(changes: readonly ChangeRecord[], structuralChanges: readonly StructuralChange[] = [], owner = captureHandoffOwner()): void {
  checkpoints.set(owner.draftId, fingerprintSnapshot(owner, changes, structuralChanges));
  reconciledCounts.delete(owner.draftId);
  notify();
}

export function getClipboardHandoffSnapshot(): ClipboardHandoffSnapshot | null {
  return checkpoints.size ? structuredClone({ drafts: [...checkpoints.values()] }) : null;
}

export function hydrateClipboardHandoff(value: ClipboardHandoffSnapshot | null): void {
  checkpoints.clear();
  for (const draft of value?.drafts ?? []) checkpoints.set(draft.owner.draftId, structuredClone(draft));
  reconciledCounts.clear();
  notify();
}

export function clearClipboardHandoff(): void {
  if (!checkpoints.size && !reconciledCounts.size) return;
  checkpoints.clear();
  reconciledCounts.clear();
  notify();
}

export function subscribeClipboardHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClipboardHandoffRevision(): number { return revision; }
export function getLastClipboardReconciledCount(): number { return reconciledCounts.get(getWorkspaceChanges().draftId) ?? 0; }

function matchingRecords(snapshot: ClipboardDraftHandoff) {
  const workspace = getDraftWorkspace(snapshot.owner.draftId);
  const changes = new Map(snapshot.changes.map((entry) => [entry.key, entry.fingerprint]));
  const structures = new Map(snapshot.structuralChanges.map((entry) => [entry.key, entry.fingerprint]));
  return {
    changes: workspace.changes.filter((change) => changes.get(changeKey(change)) === handoffChangeFingerprint(change)),
    structuralChanges: workspace.structuralChanges.filter((change) => structures.get(change.id) === handoffStructuralFingerprint(change)),
  };
}

function pruneCheckpoints(): void {
  let changed = false;
  for (const [id, snapshot] of checkpoints) {
    const matching = matchingRecords(snapshot);
    if (matching.changes.length === snapshot.changes.length && matching.structuralChanges.length === snapshot.structuralChanges.length) continue;
    changed = true;
    if (matching.changes.length + matching.structuralChanges.length === 0) checkpoints.delete(id);
    else checkpoints.set(id, fingerprintSnapshot(snapshot.owner, matching.changes, matching.structuralChanges));
  }
  if (changed) notify();
}

export async function reconcileClipboardHandoff(doc: Document = document): Promise<number> {
  let removed = 0;
  for (const snapshot of [...checkpoints.values()]) {
    const matching = matchingRecords(snapshot);
    if (matching.changes.length + matching.structuralChanges.length === 0) continue;
    const count = await verifyAndReconcileHandoff({ owner: snapshot.owner, ...matching }, doc);
    if (count > 0) reconciledCounts.set(snapshot.owner.draftId, count);
    removed += count;
  }
  pruneCheckpoints();
  if (removed > 0) {
    notify();
  }
  return removed;
}

export function startClipboardHandoffController(doc: Document = document): () => void {
  const view = doc.defaultView;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checking = false;
  let stopped = false;
  const schedule = () => {
    if (stopped || checking || !checkpoints.size) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped || checking || !checkpoints.size) return;
      checking = true;
      void reconcileClipboardHandoff(doc).catch(() => undefined).finally(() => {
        setTimeout(() => { checking = false; }, 0);
      });
    }, 450);
  };
  const visible = () => { if (doc.visibilityState === "visible") schedule(); };
  documentRevisions(doc);
  const stopRevision = subscribeDocumentRevision(doc, schedule);
  const stopChanges = subscribeWorkspaceChanges(pruneCheckpoints);
  view?.addEventListener("focus", schedule);
  view?.addEventListener("pageshow", schedule);
  doc.addEventListener("visibilitychange", visible);
  schedule();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    stopRevision();
    stopChanges();
    view?.removeEventListener("focus", schedule);
    view?.removeEventListener("pageshow", schedule);
    doc.removeEventListener("visibilitychange", visible);
  };
}
