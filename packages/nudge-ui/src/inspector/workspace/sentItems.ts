import { changeKey } from "../changes/model.ts";
import { canEditDraft, getActiveDraftChanges, reconcileDraftChanges } from "../drafts/store.ts";
import type { ChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { unchangedHandoffRecords, type HandoffSnapshot } from "../agent/verification.ts";
import { getClipboardHandoffRecords } from "../prompt/clipboardHandoff.ts";
import { getCommentsForTarget, removeComment, type ElementComment } from "../comments/store.ts";
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

/** Removes sent items and their draft history, preserving newer, unsent edits. */
export function clearSentItems(items: SentItems): void {
  const current = getActiveDraftChanges();
  if (current.draftId !== items.draftId || !canEditDraft(items.draftId) || sentItemCount(items) === 0) return;
  const keys = new Set(items.changes.map(changeKey));
  const ids = new Set(items.structuralChanges.map((change) => change.id));
  reconcileDraftChanges(items.draftId, keys, ids);
  for (const comment of items.comments) removeComment(comment.id);
}
