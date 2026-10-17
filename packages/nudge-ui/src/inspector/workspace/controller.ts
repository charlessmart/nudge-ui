import {
  getCanvasCards,
  getFocusedCardId,
  getSelectedCardId,
  subscribe as subscribeCanvas,
  setCanvasHistoryActivator,
} from "../canvas/canvasStore.ts";
import { subscribeCanvasView } from "../canvas/viewStore.ts";
import { loadComments } from "../comments/store.ts";
import {
  loadDrafts,
  activateDraft,
  activateDraftForCard,
  draftIdForCard,
  forgetDraft,
  getActiveDraftChanges,
  isDraftLocked,
  subscribeDrafts,
} from "../drafts/store.ts";
import { applicationTarget, targetKey } from "../drafts/model.ts";
import { iterationId, contentEditTarget } from "../canvas/frameContent.ts";
import { setFrameLifecycle } from "../canvas/frameLifecycle.ts";
import { removeHtmlArtifact } from "../iterations/client.ts";
import {
  hydrateSession,
  enableAutoSave,
  scheduleAutoSave,
  flushAutoSave,
  resetAutoSave,
} from "../canvas/sessionStore.ts";
import { releaseLease } from "../canvas/workspaceLease.ts";
import { subscribeClipboardHandoff } from "../prompt/clipboardHandoff.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { releaseDetachedIterations } from "./timeline.ts";

export function startWorkspaceController() {
  const config = getNudgeUiRuntimeConfig();
  const persistent = config.demo !== true;
  loadComments();
  loadDrafts(config.projectId, { persistent });
  const result = persistent ? hydrateSession() : { restored: false };
  const save = persistent ? scheduleAutoSave : () => undefined;
  // Canvas reports a removed frame; drafts and artifacts decide what to release.
  setFrameLifecycle({
    canEdit: () => !isDraftLocked(),
    release: (released, remaining) => {
      const artifactId = iterationId(released);
      if (!artifactId) return;
      if (remaining.some((content) => iterationId(content) === artifactId)) return;
      forgetDraft(targetKey(contentEditTarget(released)));
      void removeHtmlArtifact(artifactId).catch((error: unknown) => {
        console.warn("Nudge UI could not remove an unused HTML iteration:", error);
      });
    },
  });
  let active = "";
  const synchronize = () => {
    const cardId = getSelectedCardId() ?? getFocusedCardId() ?? getCanvasCards()[0]?.id;
    const draftId = (cardId && draftIdForCard(cardId)) || targetKey(applicationTarget());
    const next = `${cardId ?? ""}\n${draftId}`;
    if (next === active && getActiveDraftChanges().draftId === draftId) return;
    active = next;
    activateDraft(draftId, cardId);
  };
  synchronize();
  setCanvasHistoryActivator(activateDraftForCard);
  if (persistent) enableAutoSave();
  const stopCanvas = subscribeCanvas(() => {
    synchronize();
    save();
  });
  const stopView = subscribeCanvasView(save);
  const stopDrafts = subscribeDrafts(save);
  const stopClipboard = subscribeClipboardHandoff(save);
  const beforeunload = () => {
    flushAutoSave();
    releaseLease();
  };
  const pagehide = (event: PageTransitionEvent) => {
    flushAutoSave();
    if (!event.persisted) releaseDetachedIterations();
  };
  if (persistent) window.addEventListener("beforeunload", beforeunload);
  window.addEventListener("pagehide", pagehide);
  return {
    restored: result.restored,
    dispose() {
      flushAutoSave();
      stopCanvas();
      stopView();
      stopDrafts();
      stopClipboard();
      window.removeEventListener("beforeunload", beforeunload);
      window.removeEventListener("pagehide", pagehide);
      setCanvasHistoryActivator(() => undefined);
      setFrameLifecycle(null);
      resetAutoSave();
    },
  };
}
