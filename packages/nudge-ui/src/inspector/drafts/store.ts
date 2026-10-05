import { useSyncExternalStore } from "react";
import { getCanvasCards, selectCard, focusCanvasCards, activateIframeWorkspace } from "../canvas/canvasStore.ts";
import { contentEditTarget, type FrameContent } from "../canvas/frameContent.ts";
import {
  deserializeChange,
  isSerializableChange,
  serializeChange,
  type SerializableChange,
} from "../changes/codecs.ts";
import {
  getActiveDraftChanges,
  getDraftChanges,
  restoreDraftChanges,
  subscribeDraftChanges,
  setActiveDraft,
  clearDraftChanges,
  listDraftIds,
  resetDraftChanges,
  type DraftContents,
} from "../changes/draftChanges.ts";
import { refreshDraftPreview } from "../changes/changesLog.ts";
import { isStructuralChange } from "../projection/structuralProjection.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { getSketchStoreSnapshot, subscribeSketchStore } from "../sketch/store.ts";
import type { SketchDocument } from "../sketch/model.ts";
import { documentTarget, isDraftTarget, targetFromKey, targetKey, type Draft, type DraftTarget, type DraftSnapshot } from "./model.ts";

interface PersistedDraft {
  readonly target: DraftTarget;
  readonly revision: number;
  readonly contents: { readonly changes: readonly SerializableChange[]; readonly structuralChanges: DraftContents["structuralChanges"] };
}

interface PersistedDrafts {
  readonly schemaVersion: 2;
  readonly projectId: string;
  readonly drafts: readonly PersistedDraft[];
  readonly sketchOwners: Readonly<Record<string, string>>;
}

let projectId = "";
let persistent = true;
/** Overrides the capture-URL owner for sketches drawn while another draft was active. */
const sketchOwners = new Map<string, string>();
const contentDrafts = new WeakMap<FrameContent, string>();
const listeners = new Set<() => void>();
let snapshot: DraftSnapshot | null = null;

function publish(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

subscribeDraftChanges(publish);
subscribeSketchStore(publish);

function storageKey(): string { return `nudge-ui-drafts:${projectId}:v2`; }

export function draftIdForContent(content: FrameContent): string {
  let id = contentDrafts.get(content);
  if (id === undefined) {
    id = targetKey(contentEditTarget(content));
    contentDrafts.set(content, id);
  }
  return id;
}

export function draftIdForCard(cardId: string): string | null {
  const card = getCanvasCards().find((candidate) => candidate.id === cardId);
  return card ? draftIdForContent(card.content) : null;
}

export function sketchOwner(document: SketchDocument): string | null {
  const owner = sketchOwners.get(document.id);
  if (owner) return owner;
  try { return targetKey(documentTarget(document.capture.url)); } catch { return null; }
}

function readDraft(id: string, target: DraftTarget): Draft {
  const workspace = getDraftChanges(id);
  return {
    id,
    target,
    revision: workspace.revision,
    contents: { changes: workspace.changes, structuralChanges: workspace.structuralChanges },
    sketchIds: getSketchStoreSnapshot().documents.filter((document) => sketchOwner(document) === id).map((document) => document.id),
  };
}

export function getDraft(id: string): Draft | null {
  const target = targetFromKey(id);
  return target ? readDraft(id, target) : null;
}

export function getDraftForCard(cardId: string): Draft | null {
  const id = draftIdForCard(cardId);
  return id ? getDraft(id) : null;
}

export function getDraftContentsForCard(cardId: string): DraftContents | null {
  const draft = getDraftForCard(cardId);
  return draft ? { changes: draft.contents.changes, structuralChanges: draft.contents.structuralChanges } : null;
}

export function persistDrafts(): void {
  if (!projectId || !persistent || !canWriteWorkspace()) return;
  const sketches = getSketchStoreSnapshot();
  const liveSketches = new Set(sketches.documents.map((document) => document.id));
  const value: PersistedDrafts = {
    schemaVersion: 2, projectId,
    drafts: listDraftIds().flatMap((id) => {
      const target = targetFromKey(id);
      const workspace = getDraftChanges(id);
      if (!target || workspace.changes.length + workspace.structuralChanges.length === 0) return [];
      return [{
        target,
        revision: workspace.revision,
        contents: {
          changes: workspace.changes.flatMap((change) => {
            const serialized = serializeChange(change);
            return serialized ? [serialized] : [];
          }),
          structuralChanges: workspace.structuralChanges,
        },
      }];
    }),
    sketchOwners: Object.fromEntries([...sketchOwners].filter(([id]) => !sketches.ready || liveSketches.has(id))),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(value));
  } catch {
    return;
  }
}

function validPersisted(value: unknown): value is PersistedDrafts {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedDrafts;
  if (candidate.schemaVersion !== 2 || candidate.projectId !== projectId || !Array.isArray(candidate.drafts)) return false;
  const targets = new Set<string>();
  for (const draft of candidate.drafts) {
    if (!draft || !isDraftTarget(draft.target) || targets.has(targetKey(draft.target))
      || !Number.isSafeInteger(draft.revision) || draft.revision < 1
      || !draft.contents || !Array.isArray(draft.contents.changes) || !draft.contents.changes.every(isSerializableChange)
      || !Array.isArray(draft.contents.structuralChanges) || !draft.contents.structuralChanges.every(isStructuralChange)) return false;
    const textIds = draft.contents.changes.filter((change: SerializableChange) => change.kind === "text-content").map((change: SerializableChange) => "id" in change ? change.id : "");
    if (new Set(textIds).size !== textIds.length) return false;
    targets.add(targetKey(draft.target));
  }
  return !!candidate.sketchOwners && typeof candidate.sketchOwners === "object" && !Array.isArray(candidate.sketchOwners)
    && Object.values(candidate.sketchOwners).every((id) => typeof id === "string" && targetFromKey(id) !== null);
}

/** Replaces every in-memory draft with the stored drafts, so a tab that takes over never writes stale edits. */
export function loadDrafts(nextProjectId: string, options: { persistent?: boolean } = {}): void {
  projectId = nextProjectId;
  persistent = options.persistent ?? true;
  sketchOwners.clear();
  resetDraftChanges();
  try {
    const raw = persistent ? localStorage.getItem(storageKey()) : null;
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (validPersisted(stored)) {
      for (const draft of stored.drafts) {
        restoreDraftChanges(targetKey(draft.target), { changes: draft.contents.changes.map(deserializeChange), structuralChanges: draft.contents.structuralChanges }, draft.revision);
      }
      for (const [sketchId, draftId] of Object.entries(stored.sketchOwners)) sketchOwners.set(sketchId, draftId);
    }
  } catch {
    resetDraftChanges();
    sketchOwners.clear();
  }
  publish();
  refreshDraftPreview();
}

export function activateDraftForCard(cardId: string): void {
  const draftId = draftIdForCard(cardId);
  if (draftId) activateDraft(draftId, cardId);
}

export function activateDraft(draftId: string, preferredCardId?: string): void {
  const previous = getActiveDraftChanges().draftId;
  setActiveDraft(draftId, () => revealDraft(draftId, preferredCardId));
  if (previous !== draftId) refreshDraftPreview();
}

function revealDraft(draftId: string, preferredCardId: string | undefined): void {
  const cards = getCanvasCards();
  let frame = cards.find((card) => card.id === preferredCardId && draftIdForContent(card.content) === draftId)
    ?? cards.find((card) => draftIdForContent(card.content) === draftId);
  const target = targetFromKey(draftId);
  if (!frame && target?.kind === "application") {
    const original = cards.find((card) => card.id === preferredCardId && card.content.kind === "route");
    if (original) {
      selectCard(original.id);
      frame = activateIframeWorkspace(target.route, { width: window.innerWidth, height: window.innerHeight }, { replaceActiveCard: true }) ?? undefined;
    }
  }
  if (!frame) return;
  activateDraftForCard(frame.id);
  selectCard(frame.id);
  focusCanvasCards([frame.id]);
}

export function clearSavedIterationDraft(cardId: string, expectedRevision?: number): boolean {
  const draftId = draftIdForCard(cardId);
  return !!draftId && clearDraftChanges(draftId, expectedRevision);
}

/** Returns the first preferred frame that exists, then the first frame. */
export function getEditableCardId(...preferredCardIds: readonly (string | null | undefined)[]): string | null {
  const cards = getCanvasCards();
  return preferredCardIds.find((id): id is string => !!id && cards.some((card) => card.id === id)) ?? cards[0]?.id ?? null;
}

export function assignSketchToDraft(draftId: string, sketchId: string): void {
  if (sketchOwners.get(sketchId) === draftId || !targetFromKey(draftId)) return;
  sketchOwners.set(sketchId, draftId);
  publish();
}

export function sketchBelongsToCard(document: SketchDocument, cardId: string | null): boolean {
  if (!projectId || !cardId) return true;
  const draftId = draftIdForCard(cardId);
  return !!draftId && sketchOwner(document) === draftId;
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDraftsSnapshot(): DraftSnapshot {
  if (!snapshot) {
    const ids = new Set([...listDraftIds(), ...getSketchStoreSnapshot().documents.flatMap((document) => sketchOwner(document) ?? [])]);
    snapshot = { projectId, drafts: [...ids].flatMap((id) => getDraft(id) ?? []) };
  }
  return snapshot;
}

export function useDrafts(): DraftSnapshot { return useSyncExternalStore(subscribeDrafts, getDraftsSnapshot, getDraftsSnapshot); }

/** Discards stored and in-memory drafts for the current project. */
export function clearDrafts(): void {
  if (projectId && persistent && canWriteWorkspace()) {
    try { localStorage.removeItem(storageKey()); } catch { return; }
  }
  sketchOwners.clear();
  resetDraftChanges();
  publish();
}

export function resetDrafts(): void {
  projectId = "";
  persistent = true;
  sketchOwners.clear();
  resetDraftChanges();
  publish();
}
