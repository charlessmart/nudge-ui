import { changeKey } from "../changes/model.ts";
import { commitDraftContents, type ChangeRecord } from "../changes/changesLog.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { getActiveDraftChanges, getDraftChanges } from "../changes/draftChanges.ts";
import { unchangedHandoffRecords, type HandoffSnapshot } from "../agent/verification.ts";
import { getClipboardHandoffRecords } from "../prompt/clipboardHandoff.ts";
import { getComments, getCommentsForTarget, removeComment, saveComment, type ElementComment } from "../comments/store.ts";
import type { DraftTarget } from "../drafts/model.ts";

/** Handed-off work that verification has not confirmed and the user has not changed since. */
export interface SentItems {
  readonly draftId: string;
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
  readonly comments: readonly ElementComment[];
}

export function getSentItems(draftId: string, target: DraftTarget, agentDispatch: HandoffSnapshot | null): SentItems {
  const clipboard = getClipboardHandoffRecords(draftId);
  const agent = agentDispatch?.owner.draftId === draftId
    ? unchangedHandoffRecords(agentDispatch)
    : { changes: [], structuralChanges: [] };
  const changes = new Map([...clipboard.changes, ...agent.changes].map((change) => [changeKey(change), change]));
  const structuralChanges = new Map([...clipboard.structuralChanges, ...agent.structuralChanges].map((change) => [change.id, change]));
  return {
    draftId,
    changes: [...changes.values()],
    structuralChanges: [...structuralChanges.values()],
    comments: getCommentsForTarget(target).filter((comment) => comment.handedOff),
  };
}

export function sentItemCount(items: SentItems): number {
  return items.changes.length + items.structuralChanges.length + items.comments.length;
}

/**
 * Removes sent items from the active draft as one undoable edit. Returns a
 * restore callback, or null when the draft is not active or nothing changed.
 */
export function clearSentItems(items: SentItems): (() => void) | null {
  const current = getActiveDraftChanges();
  if (current.draftId !== items.draftId || sentItemCount(items) === 0) return null;
  const keys = new Set(items.changes.map(changeKey));
  const ids = new Set(items.structuralChanges.map((change) => change.id));
  const draftChanged = items.changes.length + items.structuralChanges.length > 0;
  if (draftChanged && !commitDraftContents(
    current.changes.filter((change) => !keys.has(changeKey(change))),
    current.structuralChanges.filter((change) => !ids.has(change.id)),
  )) return null;
  for (const comment of items.comments) removeComment(comment.id);
  return () => {
    const draft = getDraftChanges(items.draftId);
    if (draftChanged && getActiveDraftChanges().draftId === items.draftId) {
      const present = new Set(draft.changes.map(changeKey));
      const presentIds = new Set(draft.structuralChanges.map((change) => change.id));
      commitDraftContents(
        [...draft.changes, ...items.changes.filter((change) => !present.has(changeKey(change)))],
        [...draft.structuralChanges, ...items.structuralChanges.filter((change) => !presentIds.has(change.id))],
      );
    }
    const existing = new Set(getComments().map((comment) => comment.id));
    for (const comment of items.comments) if (!existing.has(comment.id)) saveComment(comment);
  };
}
