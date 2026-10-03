import { useSyncExternalStore } from "react";
import { getCanvasCards, selectCard, focusCanvasCards } from "../canvas/canvasStore.ts";
import { contentEditTarget } from "../canvas/frameContent.ts";
import {
  deserializeChange,
  isSerializableChange,
  serializeChange,
  type SerializableChange,
} from "../changes/codecs.ts";
import {
  getWorkspaceChanges,
  getDraftWorkspace,
  restoreDraftWorkspace,
  subscribeDraftWorkspaces,
  setWorkspaceHistoryContext,
  clearDraftWorkspace,
  resetWorkspaceChanges,
  type WorkspaceContents,
} from "../changes/workspaceChanges.ts";
import { refreshWorkspacePreview } from "../changes/changesLog.ts";
import { discardWorkspaceHistory } from "../workspace/timeline.ts";
import { isStructuralChange } from "../projection/structuralProjection.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { isDraftTarget, targetKey, type Draft, type DraftTarget, type DraftSnapshot } from "./model.ts";

interface DraftMetadata {
  readonly id: string;
  readonly target: DraftTarget;
  readonly sketchIds: readonly string[];
}

interface PersistedDraft extends DraftMetadata {
  readonly revision: number;
  readonly contents: { readonly changes: readonly SerializableChange[]; readonly structuralChanges: WorkspaceContents["structuralChanges"] };
}

interface PersistedDrafts {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly drafts: readonly PersistedDraft[];
  readonly cardDrafts: Readonly<Record<string, string>>;
}

let projectId = "";
let persistent = true;
const drafts = new Map<string, DraftMetadata>();
const cardDrafts = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: DraftSnapshot = { projectId: "", drafts: [] };

function publish(): void {
  snapshot = { projectId, drafts: [...drafts.values()].map(readDraft) };
  for (const listener of listeners) listener();
}

function readDraft(metadata: DraftMetadata): Draft {
  const workspace = getDraftWorkspace(metadata.id);
  return {
    ...metadata,
    revision: workspace.revision,
    contents: { changes: workspace.changes, structuralChanges: workspace.structuralChanges },
  };
}

function storageKey(): string { return `nudge-ui-drafts:${projectId}:v1`; }

export function persistDrafts(): void {
  if (!projectId || !persistent || !canWriteWorkspace()) return;
  const value: PersistedDrafts = {
    schemaVersion: 1, projectId,
    drafts: [...drafts.values()].map((metadata) => {
      const workspace = getDraftWorkspace(metadata.id);
      return {
        ...metadata,
        revision: workspace.revision,
        contents: {
          changes: workspace.changes.flatMap((change) => {
            const serialized = serializeChange(change);
            return serialized ? [serialized] : [];
          }),
          structuralChanges: workspace.structuralChanges,
        },
      };
    }),
    cardDrafts: Object.fromEntries(cardDrafts),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(value));
  } catch {
    return;
  }
}

subscribeDraftWorkspaces((id) => {
  if (!drafts.has(id)) return;
  publish();
});

function validPersisted(value: unknown): value is PersistedDrafts {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedDrafts;
  if (candidate.schemaVersion !== 1 || candidate.projectId !== projectId || !Array.isArray(candidate.drafts)) return false;
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const draft of candidate.drafts) {
    if (!draft || typeof draft.id !== "string" || ids.has(draft.id) || !isDraftTarget(draft.target)
      || targets.has(targetKey(draft.target)) || !Number.isSafeInteger(draft.revision) || draft.revision < 1
      || !Array.isArray(draft.sketchIds) || draft.sketchIds.some((id: unknown) => typeof id !== "string")
      || !draft.contents || !Array.isArray(draft.contents.changes) || !draft.contents.changes.every(isSerializableChange)
      || !Array.isArray(draft.contents.structuralChanges) || !draft.contents.structuralChanges.every(isStructuralChange)) return false;
    const textIds = draft.contents.changes.filter((change: SerializableChange) => change.kind === "text-content").map((change: SerializableChange) => "id" in change ? change.id : "");
    if (new Set(textIds).size !== textIds.length) return false;
    ids.add(draft.id);
    targets.add(targetKey(draft.target));
  }
  return !!candidate.cardDrafts && typeof candidate.cardDrafts === "object" && !Array.isArray(candidate.cardDrafts)
    && Object.values(candidate.cardDrafts).every((id) => typeof id === "string" && ids.has(id));
}

export function initializeDrafts(nextProjectId: string, cardIds: readonly string[], options: { persistent?: boolean } = {}): void {
  let changed = false;
  if (projectId !== nextProjectId || persistent !== (options.persistent ?? true)) {
    changed = true;
    const initial = getWorkspaceChanges();
    drafts.clear();
    cardDrafts.clear();
    projectId = nextProjectId;
    persistent = options.persistent ?? true;
    try {
      const raw = persistent ? localStorage.getItem(storageKey()) : null;
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (validPersisted(stored)) {
        for (const draft of stored.drafts) {
          drafts.set(draft.id, { id: draft.id, target: draft.target, sketchIds: draft.sketchIds });
          restoreDraftWorkspace(draft.id, { changes: draft.contents.changes.map(deserializeChange), structuralChanges: draft.contents.structuralChanges }, draft.revision);
        }
        for (const [cardId, draftId] of Object.entries(stored.cardDrafts)) cardDrafts.set(cardId, draftId);
      }
    } catch {
      drafts.clear();
      cardDrafts.clear();
    }
    if (drafts.size === 0) createDraft({ kind: "application" }, initial);
  }
  for (const cardId of cardIds) {
    const card = getCanvasCards().find((card) => card.id === cardId);
    const current = getDraftForCard(cardId);
    if (current && (!card || targetKey(current.target) === targetKey(contentEditTarget(card.content)))) continue;
    changed = true;
    attachDraftToCard(cardId, card ? contentEditTarget(card.content) : { kind: "application" });
  }
  if (changed) publish();
}

function createDraft(target: DraftTarget, contents: WorkspaceContents = { changes: [], structuralChanges: [] }, sketchIds: readonly string[] = []): DraftMetadata {
  const metadata: DraftMetadata = { id: `draft-${crypto.randomUUID()}`, target, sketchIds: [...sketchIds] };
  restoreDraftWorkspace(metadata.id, contents);
  drafts.set(metadata.id, metadata);
  return metadata;
}

export function attachDraftToCard(cardId: string, target: DraftTarget): Draft {
  const metadata = [...drafts.values()].find((draft) => targetKey(draft.target) === targetKey(target)) ?? createDraft(target);
  cardDrafts.set(cardId, metadata.id);
  publish();
  return readDraft(metadata);
}

export function createStudyDraft(sourceCardId: string, targetCardId: string, artifactId: string): Draft | null {
  const source = getDraftForCard(sourceCardId);
  if (!source) return null;
  const target: DraftTarget = { kind: "html", artifactId, path: `.nudge/artifacts/${artifactId}/document.html` };
  const metadata = [...drafts.values()].find((draft) => targetKey(draft.target) === targetKey(target))
    ?? createDraft(target, undefined, source.sketchIds);
  cardDrafts.set(targetCardId, metadata.id);
  publish();
  return readDraft(metadata);
}

export function activateDraftForCard(cardId: string): void {
  const draftId = cardDrafts.get(cardId);
  if (!draftId) return;
  const previous = getWorkspaceChanges().draftId;
  setWorkspaceHistoryContext(draftId, () => {
    const target = getCanvasCards().find((card) => card.id === cardId) ?? getCanvasCards().find((card) => cardDrafts.get(card.id) === draftId);
    if (!target) return;
    activateDraftForCard(target.id);
    selectCard(target.id);
    focusCanvasCards([target.id]);
  });
  if (previous !== draftId) refreshWorkspacePreview();
}

export function getDraft(id: string): Draft | null {
  const metadata = drafts.get(id);
  return metadata ? readDraft(metadata) : null;
}

export function getDraftForCard(cardId: string): Draft | null {
  const id = cardDrafts.get(cardId);
  return id ? getDraft(id) : null;
}

export function getWorkspaceForCard(cardId: string): WorkspaceContents | null {
  const draft = getDraftForCard(cardId);
  return draft ? { changes: draft.contents.changes, structuralChanges: draft.contents.structuralChanges } : null;
}

export function clearCommittedArtifactDraft(cardId: string, expectedRevision?: number): boolean {
  const draftId = cardDrafts.get(cardId);
  return !!draftId && clearDraftWorkspace(draftId, expectedRevision);
}

export function getEditableCardId(...preferredCardIds: readonly (string | null | undefined)[]): string | null {
  return preferredCardIds.find((id): id is string => !!id && cardDrafts.has(id)) ?? cardDrafts.keys().next().value ?? null;
}

export function addDraftSketch(draftId: string, sketchId: string): void {
  const draft = drafts.get(draftId);
  if (!draft || draft.sketchIds.includes(sketchId)) return;
  drafts.set(draftId, { ...draft, sketchIds: [...draft.sketchIds, sketchId] });
  publish();
}

export function sketchBelongsToCard(sketchId: string, cardId: string | null): boolean {
  if (!projectId || !cardId) return true;
  return getDraftForCard(cardId)?.sketchIds.includes(sketchId) ?? false;
}

export function removeCardDraft(cardId: string): void {
  const id = cardDrafts.get(cardId);
  cardDrafts.delete(cardId);
  if (id && ![...cardDrafts.values()].includes(id)) discardWorkspaceHistory(id);
  publish();
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDraftsSnapshot(): DraftSnapshot { return snapshot; }
export function useDrafts(): DraftSnapshot { return useSyncExternalStore(subscribeDrafts, getDraftsSnapshot, getDraftsSnapshot); }

export function clearDrafts(): void {
  if (projectId && persistent && canWriteWorkspace()) {
    try { localStorage.removeItem(storageKey()); } catch { return; }
  }
  resetDrafts();
}

export function resetDrafts(): void {
  projectId = "";
  persistent = true;
  drafts.clear();
  cardDrafts.clear();
  resetWorkspaceChanges();
  publish();
}
