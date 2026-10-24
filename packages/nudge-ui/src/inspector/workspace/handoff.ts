import { captureHandoffOwner, type HandoffSnapshot } from "../prompt/handoffVerification.ts";
import { htmlIterationImplementationPrompt, htmlIterationPrompt } from "../iterations/prompt.ts";
import { getCanvasCardLabel, getCanvasCards } from "../canvas/canvasStore.ts";
import { getCommentsForTarget, markCommentsHandedOff, type ElementComment } from "../comments/store.ts";
import { applicationTarget } from "../drafts/model.ts";
import { prepareHtmlIterationHandoff } from "../iterations/coordinator.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { getDraftChanges } from "../drafts/store.ts";
import { recordClipboardHandoff } from "../prompt/clipboardHandoff.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { generatePrompt, type FrameworkHints } from "../prompt/generatePrompt.ts";
import { withPromptContext } from "../prompt/promptDocument.ts";

export interface HandoffRequest {
  readonly cardId: string | null;
  readonly hints: FrameworkHints;
  readonly customInstructions: string;
}

export interface PreparedHandoff extends HandoffSnapshot {
  readonly prompt: string;
  readonly comments: readonly ElementComment[];
}

async function prepareDraftHandoff(request: HandoffRequest): Promise<Omit<PreparedHandoff, "prompt">> {
  const owner = captureHandoffOwner(request.cardId);
  const target = owner.target;
  const comments = [...getCommentsForTarget(target)];
  let { changes, structuralChanges } = getDraftChanges(owner.draftId);
  if (target.kind === "html") {
    const frame = request.cardId ? getRegisteredFrames().get(request.cardId) : undefined;
    if (!request.cardId || !frame) throw new Error("The HTML iteration is still loading. Try again when the frame is ready.");
    ({ changes, structuralChanges } = await prepareHtmlIterationHandoff(request.cardId, target.artifactId, frame));
  }
  return { owner, changes: [...changes], structuralChanges: [...structuralChanges], comments };
}

export async function prepareHandoff(request: HandoffRequest): Promise<PreparedHandoff> {
  const handoff = await prepareDraftHandoff(request);
  const { owner: { target }, changes, structuralChanges, comments } = handoff;
  const hints = target.kind === "html" ? { ...request.hints, framework: "HTML" } : request.hints;
  const generated = generatePrompt([...changes], hints, structuralChanges, request.customInstructions, comments);
  const prompt = target.kind === "html"
    ? htmlIterationPrompt(target.artifactId, generated, changes.length + structuralChanges.length + comments.length === 0, request.customInstructions)
    : withPromptContext([`The page I'm working on is ${target.route}.`], generated);
  return { ...handoff, prompt };
}

export async function prepareIterationImplementationPrompt(request: HandoffRequest): Promise<string> {
  const cards = getCanvasCards();
  const card = cards.find((candidate) => candidate.id === request.cardId);
  if (card?.content.kind !== "iteration") throw new Error("Select an HTML iteration to implement in the app.");
  const label = getCanvasCardLabel(card, cards);
  const page = applicationTarget(card.content.sourceUrl).route;
  const { changes, structuralChanges, comments } = await prepareDraftHandoff(request);
  const instructions = request.customInstructions.trim();
  const generated = changes.length + structuralChanges.length + comments.length > 0
    ? generatePrompt([...changes], request.hints, structuralChanges, instructions, comments)
    : instructions;
  return htmlIterationImplementationPrompt(card.content.artifactId, label, page, generated);
}

/** Copies a prompt and records the checkpoint that later clipboard verification reconciles. */
export async function copyHandoff(handoff: PreparedHandoff): Promise<void> {
  await copyToClipboard(handoff.prompt);
  markCommentsHandedOff(handoff.comments);
  const { owner, changes, structuralChanges } = handoff;
  if (owner.target.kind === "application" && changes.length + structuralChanges.length > 0) {
    recordClipboardHandoff(changes, structuralChanges, owner);
  }
}
