import { beginActivityDispatch } from "../agent/activity.ts";
import { createPromptRevision, type AgentClient } from "../agent/client.ts";
import type { AgentSketchMetadata } from "../agent/protocol.ts";
import { captureHandoffOwner, discardAgentDispatch, recordAgentDispatch, type HandoffSnapshot } from "../agent/verification.ts";
import { htmlIterationImplementationPrompt, htmlIterationPrompt } from "../iterations/prompt.ts";
import { getCanvasCardLabel, getCanvasCards } from "../canvas/canvasStore.ts";
import { getCommentsForTarget, markCommentsHandedOff, type ElementComment } from "../comments/store.ts";
import { applicationTarget } from "../drafts/model.ts";
import { prepareHtmlIterationHandoff } from "../iterations/coordinator.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { getDraftChanges } from "../changes/draftChanges.ts";
import { recordClipboardHandoff } from "../prompt/clipboardHandoff.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { generatePrompt, type FrameworkHints } from "../prompt/generatePrompt.ts";
import {
  createSketchAttachments,
  createSketchHandoffSnapshot,
  sketchMetadataForHandoff,
  type SketchClipboardHandoffSnapshot,
} from "../sketch/handoff.ts";
import type { SketchQueueItem } from "../sketch/model.ts";
import { markSketchesDispatching, markSketchesHandingOff, settleSketchDispatch } from "../sketch/store.ts";

export interface HandoffRequest {
  readonly cardId: string | null;
  readonly hints: FrameworkHints;
  readonly customInstructions: string;
  readonly pendingSketches: readonly SketchQueueItem[];
}

export interface PreparedHandoff extends HandoffSnapshot {
  readonly prompt: string;
  readonly comments: readonly ElementComment[];
  readonly sketches: SketchClipboardHandoffSnapshot | null;
  readonly sketchMetadata: readonly AgentSketchMetadata[];
}

export type HandoffOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "copied" }
  /** The agent rejected sketch attachments; the prompt can still be copied. */
  | { readonly kind: "sketch-failed"; readonly handoff: PreparedHandoff; readonly error: string };

type PromptDispatcher = Pick<AgentClient, "dispatchPrompt" | "getSnapshot">;

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
  const sketches = createSketchHandoffSnapshot(request.pendingSketches);
  const sketchMetadata = sketchMetadataForHandoff(sketches);
  return { owner, changes: [...changes], structuralChanges: [...structuralChanges], comments, sketches, sketchMetadata };
}

export async function prepareHandoff(request: HandoffRequest): Promise<PreparedHandoff> {
  const handoff = await prepareDraftHandoff(request);
  const { owner: { target }, changes, structuralChanges, sketchMetadata, comments } = handoff;
  const hints = target.kind === "html" ? { ...request.hints, framework: "HTML" } : request.hints;
  const generated = generatePrompt([...changes], hints, structuralChanges, request.customInstructions, sketchMetadata, comments);
  const prompt = target.kind === "html"
    ? htmlIterationPrompt(target.artifactId, generated, changes.length + structuralChanges.length + comments.length === 0, sketchMetadata.length > 0, request.customInstructions)
    : `Page: ${target.route}\nApply the requested changes to this page. Shared source may affect other pages.\n\n${generated}`;
  return { ...handoff, prompt };
}

export async function prepareIterationImplementationPrompt(request: HandoffRequest): Promise<string> {
  const cards = getCanvasCards();
  const card = cards.find((candidate) => candidate.id === request.cardId);
  if (card?.content.kind !== "iteration") throw new Error("Select an HTML iteration to implement in the app.");
  const label = getCanvasCardLabel(card, cards);
  const page = applicationTarget(card.content.sourceUrl).route;
  const { changes, structuralChanges, sketchMetadata, comments } = await prepareDraftHandoff(request);
  const instructions = request.customInstructions.trim();
  const generated = changes.length + structuralChanges.length + sketchMetadata.length + comments.length > 0
    ? generatePrompt([...changes], request.hints, structuralChanges, instructions, sketchMetadata, comments)
    : instructions ? `## Custom instructions\n\n${instructions}` : "";
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

/**
 * Sends the prompt to a connected agent, or copies it when no agent is given.
 * A failed send without sketches falls back to the clipboard; a failed sketch
 * send is returned so the user can choose to copy without the images.
 */
export async function deliverHandoff(handoff: PreparedHandoff, projectId: string, agent: PromptDispatcher | null): Promise<HandoffOutcome> {
  if (agent) {
    const outcome = await dispatchHandoff(handoff, projectId, agent);
    if (outcome) return outcome;
  }
  await copyHandoff(handoff);
  return { kind: "copied" };
}

async function dispatchHandoff(handoff: PreparedHandoff, projectId: string, agent: PromptDispatcher): Promise<HandoffOutcome | null> {
  const { owner, changes, structuralChanges, sketches } = handoff;
  const revision = createPromptRevision(changes, structuralChanges, [...handoff.sketchMetadata, ...handoff.comments]);
  const entries = sketches?.entries.map((entry) => ({ id: entry.id, revision: entry.revision })) ?? [];
  recordAgentDispatch(revision, changes, structuralChanges, owner);
  const clientDispatchId = sketches?.localBatchId ?? `dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    let attachments = undefined;
    if (sketches) {
      await markSketchesDispatching(entries, revision, sketches.localBatchId);
      attachments = await createSketchAttachments(sketches);
    }
    beginActivityDispatch(projectId, clientDispatchId, owner.frameIds, owner.target);
    const response = await agent.dispatchPrompt(handoff.prompt, revision, {
      clientDispatchId,
      ...(attachments === undefined ? {} : { attachments }),
    });
    if (response) {
      markCommentsHandedOff(handoff.comments);
      if (sketches) await markSketchesHandingOff(entries, revision, sketches.localBatchId, response.request.requestId);
      return { kind: "sent" };
    }
    discardAgentDispatch(revision);
    if (!sketches) return null;
    await settleSketchDispatch(revision, "failed", undefined, sketches.localBatchId);
    const latest = agent.getSnapshot();
    return { kind: "sketch-failed", handoff, error: latest.request?.error ?? latest.error ?? "The agent did not accept the sketch attachments." };
  } catch (error) {
    discardAgentDispatch(revision);
    if (!sketches) return null;
    await settleSketchDispatch(revision, "failed", undefined, sketches.localBatchId).catch(() => undefined);
    return { kind: "sketch-failed", handoff, error: error instanceof Error ? error.message : "The sketch could not be sent to the agent." };
  }
}
