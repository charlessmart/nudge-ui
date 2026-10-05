import {
  addCanvasIteration,
  duplicateCard,
  getCanvasCardLabel,
  batchCanvasChanges,
  getCanvasCards,
  removeCanvasCard,
  selectCard,
  type CanvasCard,
} from "../canvas/canvasStore.ts";
import { contentSourceUrl } from "../canvas/frameContent.ts";
import {
  getRegisteredFrames,
  projectDraftToDocument,
  isCanvasProjectionRevisionCurrent,
  projectToAllReadyCards,
} from "../canvas/projection.ts";
import { draftIdForContent, getDraftForCard } from "../drafts/store.ts";
import { createHtmlArtifact, removeHtmlArtifact } from "../iterations/client.ts";
import { captureHtmlIteration } from "../iterations/capture.ts";
import { canEditDraft, forgetDraft, isDraftLocked } from "../changes/draftChanges.ts";
import { discardDraftHistory } from "./timeline.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { isInlineTextEditingActive } from "../inline-text/inlineTextEditor.ts";

export function addLinkedFrame(cardId: string): CanvasCard | null {
  const draft = getDraftForCard(cardId);
  if (!draft || draft.target.kind !== "application" || !canEditDraft(draft.id)) return null;
  return batchCanvasChanges(() => {
    const card = duplicateCard(cardId);
    if (card) selectCard(card.id);
    return card;
  });
}

export async function createIteration(cardId: string, position?: { x: number; y: number }): Promise<CanvasCard> {
  const source = getCanvasCards().find((card) => card.id === cardId);
  const frame = getRegisteredFrames().get(cardId);
  const draft = getDraftForCard(cardId);
  const document = frame?.contentDocument;
  if (!source || !frame || !document || !draft) throw new Error("The source frame is no longer available.");
  if (!canEditDraft(draft.id)) throw new Error("This workspace is unavailable while saving or open in another tab.");
  if (isInlineTextEditingActive()) throw new Error("Finish editing the text before creating an iteration.");
  const revision = await projectDraftToDocument(document, draft.contents);
  if (revision === null) throw new Error("The source preview is still updating. Try again.");
  try {
    const html = await captureHtmlIteration(frame);
    const current = getDraftForCard(cardId);
    if (current?.id !== draft.id || current.revision !== draft.revision || frame.contentDocument !== document
      || !isCanvasProjectionRevisionCurrent(document, revision) || !canWriteWorkspace()) {
      throw new Error("The source changed while capturing. Try again.");
    }
    const artifactId = await createHtmlArtifact(frame, contentSourceUrl(source.content), getCanvasCardLabel(source), html);
    try {
      if (!canWriteWorkspace() || getDraftForCard(cardId)?.revision !== draft.revision || frame.contentDocument !== document) {
        throw new Error("The source changed while capturing. Try again.");
      }
      return batchCanvasChanges(() => {
        const iteration = addCanvasIteration(cardId, artifactId, position, !position);
        if (!iteration) throw new Error("The source frame is no longer available.");
        selectCard(iteration.id);
        return iteration;
      });
    } catch (error) {
      await removeHtmlArtifact(artifactId);
      throw error;
    }
  } finally {
    projectToAllReadyCards();
  }
}

/** Removes a frame and discards its draft's history once no frame shows that content. */
export function removeFrame(cardId: string): boolean {
  const card = getCanvasCards().find((candidate) => candidate.id === cardId);
  if (!card || isDraftLocked()) return false;
  const draftId = draftIdForContent(card.content);
  batchCanvasChanges(() => {
    removeCanvasCard(cardId);
    if (getCanvasCards().some((candidate) => draftIdForContent(candidate.content) === draftId)) return;
    if (card.content.kind === "iteration") forgetDraft(draftId);
    else discardDraftHistory(draftId);
  });
  return true;
}
