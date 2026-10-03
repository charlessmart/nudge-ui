import {
  addCanvasVariation,
  duplicateCard,
  addCanvasRouteGrid,
  batchCanvasChanges,
  getCanvasCards,
  selectCard,
  type CanvasCard,
} from "../canvas/canvasStore.ts";
import { contentEditTarget, contentSourceUrl } from "../canvas/frameContent.ts";
import {
  getRegisteredFrames,
  projectWorkspaceSnapshotToDocument,
  isCanvasProjectionRevisionCurrent,
  projectToAllReadyCards,
} from "../canvas/projection.ts";
import { attachDraftToCard, createStudyDraft, getDraftForCard } from "../drafts/store.ts";
import { createHtmlArtifact, removeHtmlArtifact } from "../artifacts/client.ts";
import { captureHtmlStudy } from "../artifacts/capture.ts";
import { canEditWorkspace } from "../changes/workspaceChanges.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { isInlineTextEditingActive } from "../inline-text/inlineTextEditor.ts";

export function addLinkedFrame(cardId: string): CanvasCard | null {
  const draft = getDraftForCard(cardId);
  if (!draft || draft.target.kind !== "application" || !canEditWorkspace(draft.id)) return null;
  return batchCanvasChanges(() => {
    const card = duplicateCard(cardId);
    if (card) {
      attachDraftToCard(card.id, draft.target);
      selectCard(card.id);
    }
    return card;
  });
}

export async function createVariation(cardId: string, position?: { x: number; y: number }): Promise<CanvasCard> {
  const source = getCanvasCards().find((card) => card.id === cardId);
  const frame = getRegisteredFrames().get(cardId);
  const draft = getDraftForCard(cardId);
  const document = frame?.contentDocument;
  if (!source || !frame || !document || !draft) throw new Error("The source frame is no longer available.");
  if (!canEditWorkspace(draft.id)) throw new Error("This workspace is unavailable while saving or open in another tab.");
  if (isInlineTextEditingActive()) throw new Error("Finish editing the text before creating a variation.");
  const revision = await projectWorkspaceSnapshotToDocument(document, draft.contents);
  if (revision === null) throw new Error("The source preview is still updating. Try again.");
  try {
    const html = await captureHtmlStudy(frame);
    const current = getDraftForCard(cardId);
    if (current?.id !== draft.id || current.revision !== draft.revision || frame.contentDocument !== document
      || !isCanvasProjectionRevisionCurrent(document, revision) || !canWriteWorkspace()) {
      throw new Error("The source changed while capturing. Try again.");
    }
    const artifactId = await createHtmlArtifact(frame, contentSourceUrl(source.content), source.title ?? "Frame", html);
    try {
      if (!canWriteWorkspace() || getDraftForCard(cardId)?.revision !== draft.revision || frame.contentDocument !== document) {
        throw new Error("The source changed while capturing. Try again.");
      }
      return batchCanvasChanges(() => {
        const variation = addCanvasVariation(cardId, artifactId, position, !position);
        if (!variation) throw new Error("The source frame is no longer available.");
        createStudyDraft(cardId, variation.id, artifactId);
        selectCard(variation.id);
        return variation;
      });
    } catch (error) {
      await removeHtmlArtifact(artifactId);
      throw error;
    }
  } finally {
    projectToAllReadyCards();
  }
}

export function addPages(routes: readonly { url: string; title?: string }[]): CanvasCard[] {
  if (!canWriteWorkspace()) return [];
  return batchCanvasChanges(() => {
    const cards = addCanvasRouteGrid(routes);
    for (const card of cards) attachDraftToCard(card.id, contentEditTarget(card.content));
    return cards;
  });
}
