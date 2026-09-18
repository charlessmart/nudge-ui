import { changeKey } from "../changes/model.ts";
import {
  subscribeChanges,
  type ChangeRecord,
} from "../changes/changesLog.ts";
import {
  type StructuralChange,
} from "../projection/structuralProjection.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { documentRevisions, subscribeDocumentRevision } from "../tokens/resolution/cssomCollector.ts";
import {
  handoffChangeFingerprint,
  handoffStructuralFingerprint,
  verifyAndReconcileHandoff,
} from "../agent/verification.ts";

export interface ClipboardHandoffFingerprint {
  readonly key: string;
  readonly fingerprint: string;
}

export interface ClipboardHandoffSnapshot {
  readonly changes: readonly ClipboardHandoffFingerprint[];
  readonly structuralChanges: readonly ClipboardHandoffFingerprint[];
}

const MAX_HANDOFF_RECORDS = 10_000;
const MAX_KEY_LENGTH = 16_384;
const MAX_FINGERPRINT_LENGTH = 1_048_576;
const RECONCILE_DEBOUNCE_MS = 450;

let checkpoint: ClipboardHandoffSnapshot | null = null;
let revision = 0;
let lastReconciledCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function cloneSnapshot(snapshot: ClipboardHandoffSnapshot): ClipboardHandoffSnapshot {
  return {
    changes: snapshot.changes.map((entry) => ({ ...entry })),
    structuralChanges: snapshot.structuralChanges.map((entry) => ({ ...entry })),
  };
}

function isFingerprint(value: unknown): value is ClipboardHandoffFingerprint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return Object.keys(entry).every((key) => key === "key" || key === "fingerprint")
    && typeof entry.key === "string"
    && entry.key.length > 0
    && entry.key.length <= MAX_KEY_LENGTH
    && typeof entry.fingerprint === "string"
    && entry.fingerprint.length > 0
    && entry.fingerprint.length <= MAX_FINGERPRINT_LENGTH;
}

/** Validates an origin-local persisted clipboard checkpoint. */
export function isClipboardHandoffSnapshot(value: unknown): value is ClipboardHandoffSnapshot | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!Object.keys(candidate).every((key) => key === "changes" || key === "structuralChanges")
    || !Array.isArray(candidate.changes)
    || !Array.isArray(candidate.structuralChanges)
    || candidate.changes.length + candidate.structuralChanges.length > MAX_HANDOFF_RECORDS
    || !candidate.changes.every(isFingerprint)
    || !candidate.structuralChanges.every(isFingerprint)) {
    return false;
  }
  const changeKeys = candidate.changes.map((entry) => entry.key);
  const structuralKeys = candidate.structuralChanges.map((entry) => entry.key);
  return new Set(changeKeys).size === changeKeys.length
    && new Set(structuralKeys).size === structuralKeys.length;
}

/** Captures the exact records included in a successful clipboard copy. */
export function recordClipboardHandoff(
  changes: readonly ChangeRecord[],
  structuralChanges: readonly StructuralChange[] = [],
): void {
  checkpoint = {
    changes: changes.map((change) => ({
      key: changeKey(change),
      fingerprint: handoffChangeFingerprint(change),
    })),
    structuralChanges: structuralChanges.map((change) => ({
      key: change.id,
      fingerprint: handoffStructuralFingerprint(change),
    })),
  };
  lastReconciledCount = 0;
  notify();
}

/** Returns a defensive copy for durable-session serialization. */
export function getClipboardHandoffSnapshot(): ClipboardHandoffSnapshot | null {
  return checkpoint ? cloneSnapshot(checkpoint) : null;
}

/** Replaces the in-memory checkpoint from a validated durable session. */
export function hydrateClipboardHandoff(value: ClipboardHandoffSnapshot | null): void {
  if (!value && !checkpoint && lastReconciledCount === 0) return;
  checkpoint = value ? cloneSnapshot(value) : null;
  lastReconciledCount = 0;
  notify();
}

export function clearClipboardHandoff(): void {
  if (!checkpoint && lastReconciledCount === 0) return;
  checkpoint = null;
  lastReconciledCount = 0;
  notify();
}

export function subscribeClipboardHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Monotonic external-store snapshot for persistence and React consumers. */
export function getClipboardHandoffRevision(): number {
  return revision;
}

export function getLastClipboardReconciledCount(): number {
  return lastReconciledCount;
}

function matchingChanges(snapshot: ClipboardHandoffSnapshot): ChangeRecord[] {
  const expected = new Map(snapshot.changes.map((entry) => [entry.key, entry.fingerprint]));
  return getWorkspaceChanges().changes.filter(
    (change) => expected.get(changeKey(change)) === handoffChangeFingerprint(change),
  );
}

function matchingStructuralChanges(snapshot: ClipboardHandoffSnapshot): StructuralChange[] {
  const expected = new Map(
    snapshot.structuralChanges.map((entry) => [entry.key, entry.fingerprint]),
  );
  return getWorkspaceChanges().structuralChanges.filter(
    (change) => expected.get(change.id) === handoffStructuralFingerprint(change),
  );
}

/** Drops checkpoint entries that no longer describe current canonical intent. */
function pruneCheckpoint(): boolean {
  if (!checkpoint) return false;
  const changes = matchingChanges(checkpoint);
  const structuralChanges = matchingStructuralChanges(checkpoint);
  if (changes.length === checkpoint.changes.length
    && structuralChanges.length === checkpoint.structuralChanges.length) {
    return false;
  }
  checkpoint = changes.length + structuralChanges.length === 0
    ? null
    : {
      changes: changes.map((change) => ({
        key: changeKey(change),
        fingerprint: handoffChangeFingerprint(change),
      })),
      structuralChanges: structuralChanges.map((change) => ({
        key: change.id,
        fingerprint: handoffStructuralFingerprint(change),
      })),
    };
  notify();
  return true;
}

/**
 * Checks a copied prompt against source-rendered output and reconciles only
 * exact records that the browser can positively verify.
 */
export async function reconcileClipboardHandoff(doc: Document = document): Promise<number> {
  const snapshot = checkpoint;
  if (!snapshot) return 0;
  const changes = matchingChanges(snapshot);
  const structuralChanges = matchingStructuralChanges(snapshot);
  if (changes.length + structuralChanges.length === 0) {
    pruneCheckpoint();
    return 0;
  }

  const removed = await verifyAndReconcileHandoff({ changes, structuralChanges }, doc);
  pruneCheckpoint();
  if (removed > 0) {
    lastReconciledCount = removed;
    notify();
  }
  return removed;
}

/**
 * Watches source-driven document refreshes and page-return signals. The
 * trailing debounce lets an HMR commit settle before verification lifts the
 * inspector preview for two frames.
 */
export function startClipboardHandoffController(doc: Document = document): () => void {
  const ownerWindow = doc.defaultView;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checking = false;
  let stopped = false;

  const schedule = (): void => {
    if (stopped || checking || !checkpoint) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped || checking || !checkpoint) return;
      checking = true;
      void reconcileClipboardHandoff(doc)
        .catch(() => undefined)
        .finally(() => {
          // Keep the guard through the MutationObserver microtask generated by
          // restoring managed projections, preventing a verification loop.
          setTimeout(() => { checking = false; }, 0);
        });
    }, RECONCILE_DEBOUNCE_MS);
  };

  const onCanonicalChange = (): void => {
    pruneCheckpoint();
  };
  const onVisibilityChange = (): void => {
    if (doc.visibilityState === "visible") schedule();
  };

  // Initializes the document observer before registering the listener.
  documentRevisions(doc);
  const unsubscribeRevision = subscribeDocumentRevision(doc, schedule);
  const unsubscribeChanges = subscribeChanges(onCanonicalChange);
  ownerWindow?.addEventListener("focus", schedule);
  ownerWindow?.addEventListener("pageshow", schedule);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  schedule();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    unsubscribeRevision();
    unsubscribeChanges();
    ownerWindow?.removeEventListener("focus", schedule);
    ownerWindow?.removeEventListener("pageshow", schedule);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
