import { inspectorStorage } from "../runtime/inspectorStorage.ts";
import { useSyncExternalStore } from "react";
import { getCanvasCards, selectCard, focusCanvasCards, activateIframeWorkspace } from "../canvas/canvasStore.ts";
import { contentEditTarget, type FrameContent } from "../canvas/frameContent.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { createDraftPreview } from "../changes/draftPreview.ts";
import { buildManagedStyleRules } from "../changes/managedStyleProjection.ts";
import type { ChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { cancelInlineTextForClear } from "../inline-text/inlineTextLifecycle.ts";
import type { StyleRule } from "../projection/managedStylesheet.ts";
import { sessionTimeline } from "../workspace/timeline.ts";
import { createDraftStore, type CommitResult, type DraftChangesSnapshot } from "./draftStore.ts";
import { targetFromKey, targetKey, type Draft, type DraftContents, type DraftSnapshot } from "./model.ts";

const preview = createDraftPreview(() => drafts.getActive());

const drafts = createDraftStore({
  canWrite: () => canWriteWorkspace(),
  timeline: sessionTimeline,
  storage: {
    read: (key) => inspectorStorage()?.getItem(key) ?? null,
    write: (key, value) => inspectorStorage()?.setItem(key, value),
    remove: (key) => inspectorStorage()?.removeItem(key),
  },
  revealDraft: (draftId, cardId) => revealDraft(draftId, cardId),
  project: (snapshot, event) => preview.project(snapshot, event),
});

const contentDrafts = new WeakMap<FrameContent, string>();

export function getActiveDraftChanges(): DraftChangesSnapshot {
  return drafts.getActive();
}

export function subscribeActiveDraftChanges(listener: () => void): () => void {
  return drafts.subscribeActive(listener);
}

export function getDraftChanges(id: string): DraftChangesSnapshot {
  return drafts.get(id);
}

export function listDraftIds(): readonly string[] {
  return drafts.ids();
}

export function getDraft(id: string): Draft | null {
  return drafts.getDraft(id);
}

export function getDraftsSnapshot(): DraftSnapshot {
  return drafts.getSnapshot();
}

export function subscribeDrafts(listener: () => void): () => void {
  return drafts.subscribe(listener);
}

export function useDrafts(): DraftSnapshot {
  return useSyncExternalStore(subscribeDrafts, getDraftsSnapshot, getDraftsSnapshot);
}

export function canEditDraft(id?: string): boolean {
  return drafts.canEdit(id);
}

export function isDraftLocked(id?: string): boolean {
  return drafts.isLocked(id);
}

export function lockDraft(id: string): () => void {
  return drafts.lock(id);
}

function activeChanges(): ChangeRecord[] {
  // SAFETY: The public change model is the concrete record union stored by
  // the workspace snapshot; React consumers keep the mutable array type.
  return drafts.getActive().changes as ChangeRecord[];
}

export function useChanges(): ChangeRecord[] {
  return useSyncExternalStore(subscribeActiveDraftChanges, activeChanges, activeChanges);
}

export function getChangesList(): ChangeRecord[] {
  return [...activeChanges()];
}

export function getPendingRules(): StyleRule[] {
  return buildManagedStyleRules(activeChanges());
}

export interface AppendChangesOptions {
  /** The rendered target captured for each change key at commit time. */
  verificationTargets?: ReadonlyMap<string, HTMLElement | null>;
}

export function appendChanges(incoming: readonly ChangeRecord[], options: AppendChangesOptions = {}): CommitResult {
  return drafts.commitChanges(incoming, options.verificationTargets);
}

export function appendChange(change: ChangeRecord): CommitResult {
  return drafts.commitChanges([change]);
}

export function revertChange(change: ChangeRecord): void {
  drafts.revertChange(change);
}

export function discardChangesForSelector(selector: string): void {
  drafts.discardChanges({ kind: "selector", selector });
}

export function discardChangesForInstanceOverride(overrideId: string): void {
  drafts.discardChanges({ kind: "instance-override", id: overrideId });
}

export function commitStructuralChange(change: StructuralChange): boolean {
  return drafts.commitStructuralChange(change);
}

export function revertStructuralChange(changeId: string): boolean {
  return drafts.revertStructuralChange(changeId);
}

/** Replaces ordinary and structural intent as one undoable edit. */
export function commitDraftContents(changes: readonly ChangeRecord[], structuralChanges: readonly StructuralChange[]): boolean {
  return drafts.commitContents({ changes, structuralChanges });
}

export function undo(): boolean {
  return drafts.undo();
}

export function redo(): boolean {
  return drafts.redo();
}

/** Removes only source-verified records, and older undo snapshots must not resurrect their previews. */
export function reconcileDraftChanges(
  id: string,
  verifiedKeys: ReadonlySet<string>,
  verifiedStructuralIds: ReadonlySet<string>,
): number {
  return drafts.reconcile(id, verifiedKeys, verifiedStructuralIds);
}

/** Clears the active draft and its edit steps, preserving other session history. */
export function clearActiveDraft(): void {
  if (!drafts.canEdit()) return;
  // A pending blur/composition timer must not be able to append a draft after
  // the canonical set has been cleared.
  cancelInlineTextForClear();
  drafts.clearActive();
}

export function forgetDraft(id: string): void {
  drafts.forget(id);
}

export function loadDrafts(projectId: string, options: { persistent?: boolean } = {}): void {
  drafts.load(projectId, options);
}

export function persistDrafts(): void {
  drafts.persist();
}

/** Discards stored and in-memory drafts for the current project. */
export function clearDrafts(): void {
  drafts.discardAll();
}

export function resetDrafts(): void {
  drafts.reset();
}

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

export function getDraftForCard(cardId: string): Draft | null {
  const id = draftIdForCard(cardId);
  return id ? drafts.getDraft(id) : null;
}

export function getDraftContentsForCard(cardId: string): DraftContents | null {
  return getDraftForCard(cardId)?.contents ?? null;
}

export function activateDraftForCard(cardId: string): void {
  const draftId = draftIdForCard(cardId);
  if (draftId) activateDraft(draftId, cardId);
}

export function activateDraft(draftId: string, preferredCardId?: string): void {
  drafts.activate(draftId, preferredCardId);
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
  return !!draftId && drafts.clear(draftId, expectedRevision);
}

export function getEditableCardId(...preferredCardIds: readonly (string | null | undefined)[]): string | null {
  const cards = getCanvasCards();
  return preferredCardIds.find((id): id is string => !!id && cards.some((card) => card.id === id)) ?? cards[0]?.id ?? null;
}
