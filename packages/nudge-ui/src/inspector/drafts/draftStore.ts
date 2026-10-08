import {
  deserializeChange,
  isSerializableChange,
  serializeChange,
  type SerializableChange,
} from "../changes/codecs.ts";
import { changeKey, mergeChange, sameEffectiveChanges, selectorForChange } from "../changes/model.ts";
import { isElementChange, type ChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { isStructuralChange } from "../projection/structuralProjectionBoundary.ts";
import type { SketchDocument } from "../sketch/model.ts";
import type { Timeline } from "../workspace/timeline.ts";
import {
  applicationTarget,
  documentTarget,
  isDraftTarget,
  targetFromKey,
  targetKey,
  type Draft,
  type DraftContents,
  type DraftSnapshot,
  type DraftTarget,
} from "./model.ts";

export interface DraftChangesSnapshot extends DraftContents {
  readonly draftId: string;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** A canonical write result. `blocked` means the lease or a save lock refused the write. */
export type CommitResult = "applied" | "unchanged" | "blocked";

/** Why the active draft's preview must be rebuilt. */
export type DraftProjectionEvent =
  /** The active draft's contents changed through an edit, revert, undo, or redo. */
  | { readonly kind: "edit"; readonly verificationTargets?: ReadonlyMap<string, HTMLElement | null> }
  /** Source verification removed these records from the active draft. */
  | { readonly kind: "reconcile"; readonly structuralIds: ReadonlySet<string> }
  /** Another draft became active, or drafts were loaded. */
  | { readonly kind: "switch" }
  /** The active draft was cleared; every earlier preview diagnostic is void. */
  | { readonly kind: "reset" };

export type DraftDiscardTarget =
  | { readonly kind: "selector"; readonly selector: string }
  | { readonly kind: "instance-override"; readonly id: string };

export interface DraftStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export interface DraftSketchSource {
  getSnapshot(): { readonly ready: boolean; readonly documents: readonly SketchDocument[] };
  subscribe(listener: () => void): () => void;
}

export interface DraftStoreSeams {
  /** Whether this tab holds the workspace write lease. */
  canWrite(): boolean;
  readonly timeline: Timeline;
  readonly storage: DraftStorage;
  readonly sketches: DraftSketchSource;
  /** Rebuilds the active draft's preview. Called after subscribers see the new snapshot. */
  project(snapshot: DraftChangesSnapshot, event: DraftProjectionEvent): void;
}

/**
 * The Workspace's drafts. A draft's identity is its target key (ADR-0030):
 * every frame that shows one page or iteration edits the same draft. Every
 * write is lease-gated, every change to the active draft is projected, and
 * reconciliation removes only verified records, including from history.
 */
export interface DraftStore {
  getActive(): DraftChangesSnapshot;
  /** Fires for any draft content change, active-draft switch, or history change. */
  subscribeActive(listener: () => void): () => void;
  get(id: string): DraftChangesSnapshot;
  ids(): readonly string[];
  getDraft(id: string): Draft | null;
  getSnapshot(): DraftSnapshot;
  subscribe(listener: () => void): () => void;
  canEdit(id?: string): boolean;
  isLocked(id?: string): boolean;
  /** Blocks writes to one draft until the returned release runs. */
  lock(id: string): () => void;
  /** Makes a draft active; `reveal` brings its frame back when history replays an edit. */
  activate(id: string, reveal?: () => void): void;

  commitChanges(incoming: readonly ChangeRecord[], verificationTargets?: ReadonlyMap<string, HTMLElement | null>): CommitResult;
  revertChange(change: ChangeRecord): boolean;
  discardChanges(target: DraftDiscardTarget): boolean;
  commitStructuralChange(change: StructuralChange): boolean;
  revertStructuralChange(changeId: string): boolean;
  /** Replaces the active draft as one undoable edit. */
  commitContents(next: DraftContents): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Removes source-verified records so no undo step can resurrect them. */
  reconcile(id: string, verifiedKeys: ReadonlySet<string>, verifiedStructuralIds: ReadonlySet<string>): number;
  clear(id: string, expectedRevision?: number): boolean;
  clearActive(): boolean;
  /** Drops a draft whose content no longer exists, such as a deleted iteration. */
  forget(id: string): void;

  sketchOwner(document: SketchDocument): string | null;
  assignSketch(draftId: string, sketchId: string): void;

  /** Replaces every in-memory draft with the stored drafts, so a tab that takes over never writes stale edits. */
  load(projectId: string, options?: { persistent?: boolean }): void;
  persist(): void;
  /** Discards stored and in-memory drafts for the current project. */
  discardAll(): void;
  reset(): void;
}

interface DraftState {
  readonly id: string;
  revision: number;
  contents: DraftContents;
  activate?: () => void;
}

interface PersistedDraft {
  readonly target: DraftTarget;
  readonly revision: number;
  readonly contents: { readonly changes: readonly SerializableChange[]; readonly structuralChanges: readonly StructuralChange[] };
}

interface PersistedDrafts {
  readonly schemaVersion: 2;
  readonly projectId: string;
  readonly drafts: readonly PersistedDraft[];
  readonly sketchOwners: Readonly<Record<string, string>>;
}

const EMPTY: DraftContents = { changes: [], structuralChanges: [] };
const PROJECTION_RANK: Record<DraftProjectionEvent["kind"], number> = { edit: 1, reconcile: 2, switch: 3, reset: 4 };

function cloneValue<T>(value: T, key?: string): T {
  if (key === "oldToken" || key === "newToken") return value;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) clone[childKey] = cloneValue(child, childKey);
    return clone as T;
  }
  return value;
}

function freezeValue<T>(value: T, key?: string): T {
  if (key === "oldToken" || key === "newToken") return value;
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const [childKey, child] of Object.entries(value)) freezeValue(child, childKey);
    Object.freeze(value);
  }
  return value;
}

function frozenContents(value: DraftContents): DraftContents {
  return freezeValue({
    changes: value.changes.map((change) => cloneValue(change)),
    structuralChanges: value.structuralChanges.map((change) => cloneValue(change)),
  });
}

function sameDraftContents(left: DraftContents, right: DraftContents): boolean {
  return sameEffectiveChanges([...left.changes], [...right.changes])
    && JSON.stringify(left.structuralChanges) === JSON.stringify(right.structuralChanges);
}

function mergeProjection(current: DraftProjectionEvent | null, next: DraftProjectionEvent): DraftProjectionEvent {
  return current && PROJECTION_RANK[current.kind] > PROJECTION_RANK[next.kind] ? current : next;
}

function isPersistedDrafts(value: unknown, projectId: string): value is PersistedDrafts {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedDrafts;
  if (candidate.schemaVersion !== 2 || candidate.projectId !== projectId || !Array.isArray(candidate.drafts)) return false;
  const targets = new Set<string>();
  for (const draft of candidate.drafts) {
    if (!draft || !isDraftTarget(draft.target) || targets.has(targetKey(draft.target))
      || !Number.isSafeInteger(draft.revision) || draft.revision < 1
      || !draft.contents || !Array.isArray(draft.contents.changes) || !draft.contents.changes.every(isSerializableChange)
      || !Array.isArray(draft.contents.structuralChanges) || !draft.contents.structuralChanges.every(isStructuralChange)) return false;
    const textIds = draft.contents.changes
      .filter((change: SerializableChange) => change.kind === "text-content")
      .map((change: SerializableChange) => "id" in change ? change.id : "");
    if (new Set(textIds).size !== textIds.length) return false;
    targets.add(targetKey(draft.target));
  }
  return !!candidate.sketchOwners && typeof candidate.sketchOwners === "object" && !Array.isArray(candidate.sketchOwners)
    && Object.values(candidate.sketchOwners).every((id) => typeof id === "string" && targetFromKey(id) !== null);
}

export function createDraftStore(seams: DraftStoreSeams): DraftStore {
  const drafts = new Map<string, DraftState>();
  const locked = new Set<string>();
  /** Overrides the capture-URL owner for sketches drawn while another draft was active. */
  const sketchOwners = new Map<string, string>();
  const activeListeners = new Set<() => void>();
  const draftListeners = new Set<() => void>();
  /** Until a frame is activated, edits belong to the current page's draft. */
  let activeDraftId: string | null = null;
  let projectId = "";
  let persistent = true;
  let activeSnapshot: DraftChangesSnapshot | null = null;
  let draftsSnapshot: DraftSnapshot | null = null;
  let depth = 0;
  let activePending = false;
  let draftsPending = false;
  let pendingProjection: DraftProjectionEvent | null = null;

  const activeId = (): string => activeDraftId ??= targetKey(applicationTarget());
  const storageKey = (): string => `nudge-ui-drafts:${projectId}:v2`;

  function draftState(id = activeId()): DraftState {
    let draft = drafts.get(id);
    if (!draft) {
      draft = { id, revision: 0, contents: EMPTY };
      drafts.set(id, draft);
    }
    return draft;
  }

  function flush(): void {
    if (activePending) {
      activePending = false;
      for (const listener of activeListeners) listener();
    }
    if (draftsPending) {
      draftsPending = false;
      for (const listener of draftListeners) listener();
    }
    if (pendingProjection) {
      const event = pendingProjection;
      pendingProjection = null;
      seams.project(getActive(), event);
    }
  }

  /** Subscribers and the projector observe only complete, settled state. */
  function mutate<T>(operation: () => T): T {
    depth += 1;
    try {
      return operation();
    } finally {
      depth -= 1;
      if (depth === 0) flush();
    }
  }

  function activeChanged(): void {
    activeSnapshot = null;
    activePending = true;
    if (depth === 0) flush();
  }

  function draftsChanged(): void {
    draftsSnapshot = null;
    draftsPending = true;
    if (depth === 0) flush();
  }

  function contentsChanged(): void {
    draftsSnapshot = null;
    draftsPending = true;
    activeChanged();
  }

  function project(event: DraftProjectionEvent): void {
    pendingProjection = mergeProjection(pendingProjection, event);
  }

  function replaceContents(draft: DraftState, next: DraftContents): void {
    draft.contents = frozenContents(next);
    draft.revision += 1;
    contentsChanged();
  }

  function resetContents(): void {
    drafts.clear();
    locked.clear();
    activeDraftId = null;
    seams.timeline.clear();
  }

  function canEdit(id = activeId()): boolean {
    return seams.canWrite() && !locked.has(id);
  }

  function commitActive(next: DraftContents, event: DraftProjectionEvent = { kind: "edit" }): boolean {
    if (!canEdit()) return false;
    return mutate(() => {
      const draft = draftState();
      const before = draft.contents;
      replaceContents(draft, next);
      seams.timeline.recordEdit({ draftId: draft.id, activate: draft.activate, before, after: draft.contents }, sameDraftContents);
      project(event);
      return true;
    });
  }

  function activate(id: string, reveal?: () => void): void {
    mutate(() => {
      draftState(id).activate = reveal;
      if (activeId() === id) return;
      activeDraftId = id;
      activeChanged();
      project({ kind: "switch" });
    });
  }

  function replay(direction: "undo" | "redo"): boolean {
    if (locked.size > 0 || !seams.canWrite()) return false;
    return mutate(() => {
      const replayed = seams.timeline.replay(direction, (entry, next) => {
        replaceContents(draftState(entry.draftId), next);
        entry.activate?.();
        if (!entry.activate) activate(entry.draftId);
      });
      if (replayed) project({ kind: "edit" });
      return replayed;
    });
  }

  function clear(id: string, event: DraftProjectionEvent, expectedRevision?: number): boolean {
    const draft = draftState(id);
    if (!canEdit(id) || (expectedRevision !== undefined && draft.revision !== expectedRevision)) return false;
    mutate(() => {
      replaceContents(draft, EMPTY);
      seams.timeline.discardDraftHistory(id);
      if (id === activeId()) project(event);
    });
    return true;
  }

  function get(id: string): DraftChangesSnapshot {
    const draft = drafts.get(id);
    return {
      draftId: id,
      revision: draft?.revision ?? 0,
      changes: draft?.contents.changes ?? [],
      structuralChanges: draft?.contents.structuralChanges ?? [],
      ...seams.timeline.status(),
    };
  }

  function getActive(): DraftChangesSnapshot {
    if (!activeSnapshot) {
      const draft = draftState();
      activeSnapshot = Object.freeze({ draftId: draft.id, revision: draft.revision, ...draft.contents, ...seams.timeline.status() });
    }
    return activeSnapshot;
  }

  function sketchOwner(document: SketchDocument): string | null {
    const owner = sketchOwners.get(document.id);
    if (owner) return owner;
    try { return targetKey(documentTarget(document.capture.url)); } catch { return null; }
  }

  function getDraft(id: string): Draft | null {
    const target = targetFromKey(id);
    if (!target) return null;
    const { revision, changes, structuralChanges } = get(id);
    return {
      id,
      target,
      revision,
      contents: { changes, structuralChanges },
      sketchIds: seams.sketches.getSnapshot().documents.filter((document) => sketchOwner(document) === id).map((document) => document.id),
    };
  }

  function persisted(): PersistedDrafts {
    const sketches = seams.sketches.getSnapshot();
    const liveSketches = new Set(sketches.documents.map((document) => document.id));
    return {
      schemaVersion: 2,
      projectId,
      drafts: [...drafts.values()].flatMap(({ id, revision, contents }) => {
        const target = targetFromKey(id);
        if (!target || contents.changes.length + contents.structuralChanges.length === 0) return [];
        return [{
          target,
          revision,
          contents: {
            changes: contents.changes.flatMap((change) => {
              const serialized = serializeChange(change);
              return serialized ? [serialized] : [];
            }),
            structuralChanges: contents.structuralChanges,
          },
        }];
      }),
      sketchOwners: Object.fromEntries([...sketchOwners].filter(([id]) => !sketches.ready || liveSketches.has(id))),
    };
  }

  function restore(): void {
    const raw = persistent ? seams.storage.read(storageKey()) : null;
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (!isPersistedDrafts(stored, projectId)) return;
    for (const draft of stored.drafts) {
      const state = draftState(targetKey(draft.target));
      state.contents = frozenContents({
        changes: draft.contents.changes.map(deserializeChange),
        structuralChanges: draft.contents.structuralChanges,
      });
      state.revision = draft.revision;
    }
    for (const [sketchId, draftId] of Object.entries(stored.sketchOwners)) sketchOwners.set(sketchId, draftId);
  }

  seams.timeline.subscribe(activeChanged);
  seams.sketches.subscribe(draftsChanged);

  return {
    getActive,
    subscribeActive(listener) {
      activeListeners.add(listener);
      return () => activeListeners.delete(listener);
    },
    get,
    ids: () => [...drafts.keys()],
    getDraft,
    getSnapshot() {
      if (!draftsSnapshot) {
        const ids = new Set([
          ...drafts.keys(),
          ...seams.sketches.getSnapshot().documents.flatMap((document) => sketchOwner(document) ?? []),
        ]);
        draftsSnapshot = { projectId, drafts: [...ids].flatMap((id) => getDraft(id) ?? []) };
      }
      return draftsSnapshot;
    },
    subscribe(listener) {
      draftListeners.add(listener);
      return () => draftListeners.delete(listener);
    },
    canEdit,
    isLocked: (id) => id === undefined ? locked.size > 0 : locked.has(id),
    lock(id) {
      if (locked.has(id)) throw new Error("This iteration is already saving.");
      locked.add(id);
      return () => { locked.delete(id); };
    },
    activate,

    commitChanges(incoming, verificationTargets) {
      if (incoming.length === 0) return "unchanged";
      const contents = draftState().contents;
      const changes = incoming.reduce((current, change) => mergeChange(current, change), [...contents.changes]);
      if (sameEffectiveChanges([...contents.changes], changes)) return "unchanged";
      return commitActive({ ...contents, changes }, { kind: "edit", verificationTargets }) ? "applied" : "blocked";
    },
    revertChange(change) {
      const contents = draftState().contents;
      const changes = contents.changes.filter((candidate) => changeKey(candidate) !== changeKey(change));
      return changes.length !== contents.changes.length && commitActive({ ...contents, changes });
    },
    discardChanges(target) {
      const contents = draftState().contents;
      const changes = contents.changes.filter((change) => target.kind === "selector"
        ? selectorForChange(change) !== target.selector
        : !isElementChange(change) || change.instanceOverride?.id !== target.id);
      return changes.length !== contents.changes.length && commitActive({ ...contents, changes });
    },
    commitStructuralChange(change) {
      const contents = draftState().contents;
      if (contents.structuralChanges.some((candidate) => candidate.id === change.id)) return false;
      return commitActive({ ...contents, structuralChanges: [...contents.structuralChanges, change] });
    },
    revertStructuralChange(changeId) {
      const contents = draftState().contents;
      const structuralChanges = contents.structuralChanges.filter((change) => change.id !== changeId);
      return structuralChanges.length !== contents.structuralChanges.length && commitActive({ ...contents, structuralChanges });
    },
    commitContents: (next) => !sameDraftContents(draftState().contents, next) && commitActive(next),
    undo: () => replay("undo"),
    redo: () => replay("redo"),
    reconcile(id, verifiedKeys, verifiedStructuralIds) {
      if (!canEdit(id)) return 0;
      const draft = draftState(id);
      const retain = (value: DraftContents): DraftContents => ({
        changes: value.changes.filter((change) => !verifiedKeys.has(changeKey(change))),
        structuralChanges: value.structuralChanges.filter((change) => !verifiedStructuralIds.has(change.id)),
      });
      const next = retain(draft.contents);
      const removed = draft.contents.changes.length - next.changes.length
        + draft.contents.structuralChanges.length - next.structuralChanges.length;
      if (removed === 0) return 0;
      mutate(() => {
        replaceContents(draft, next);
        seams.timeline.pruneDraftHistory(id, retain, sameDraftContents);
        if (id === activeId()) project({ kind: "reconcile", structuralIds: verifiedStructuralIds });
      });
      return removed;
    },
    clear: (id, expectedRevision) => clear(id, { kind: "edit" }, expectedRevision),
    clearActive: () => clear(activeId(), { kind: "reset" }),
    forget(id) {
      if (!drafts.has(id) || locked.has(id)) return;
      mutate(() => {
        seams.timeline.discardDraftHistory(id);
        drafts.delete(id);
        contentsChanged();
        if (id === activeId()) project({ kind: "edit" });
      });
    },

    sketchOwner,
    assignSketch(draftId, sketchId) {
      if (sketchOwners.get(sketchId) === draftId || !targetFromKey(draftId)) return;
      sketchOwners.set(sketchId, draftId);
      draftsChanged();
    },

    load(nextProjectId, options = {}) {
      mutate(() => {
        projectId = nextProjectId;
        persistent = options.persistent ?? true;
        sketchOwners.clear();
        resetContents();
        try {
          restore();
        } catch {
          resetContents();
          sketchOwners.clear();
        }
        contentsChanged();
        project({ kind: "switch" });
      });
    },
    persist() {
      if (!projectId || !persistent || !seams.canWrite()) return;
      try {
        seams.storage.write(storageKey(), JSON.stringify(persisted()));
      } catch {
        return;
      }
    },
    discardAll() {
      if (projectId && persistent && seams.canWrite()) {
        try { seams.storage.remove(storageKey()); } catch { return; }
      }
      mutate(() => {
        sketchOwners.clear();
        resetContents();
        contentsChanged();
        project({ kind: "reset" });
      });
    },
    reset() {
      mutate(() => {
        projectId = "";
        persistent = true;
        sketchOwners.clear();
        resetContents();
        contentsChanged();
      });
    },
  };
}
