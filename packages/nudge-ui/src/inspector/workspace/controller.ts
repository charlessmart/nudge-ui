import {
  getCanvasCards,
  getFocusedCardId,
  getSelectedCardId,
  subscribe as subscribeCanvas,
  setCanvasHistoryActivator,
} from "../canvas/canvasStore.ts";
import { subscribeCanvasView } from "../canvas/viewStore.ts";
import { loadDrafts, activateDraft, activateDraftForCard, draftIdForCard, subscribeDrafts } from "../drafts/store.ts";
import { applicationTarget, targetKey } from "../drafts/model.ts";
import { getActiveDraftChanges } from "../changes/draftChanges.ts";
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
  loadDrafts(config.projectId, { persistent });
  const result = persistent ? hydrateSession() : { restored: false };
  const save = persistent ? scheduleAutoSave : () => undefined;
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
      resetAutoSave();
    },
  };
}
