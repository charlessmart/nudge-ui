import {
  getCanvasCards,
  getFocusedCardId,
  getSelectedCardId,
  subscribe as subscribeCanvas,
  setCanvasHistoryActivator,
} from "../canvas/canvasStore.ts";
import { initializeDrafts, activateDraftForCard, subscribeDrafts } from "../drafts/store.ts";
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
import { releaseDetachedStudies } from "./timeline.ts";

export function startWorkspaceController() {
  const config = getNudgeUiRuntimeConfig();
  const persistent = config.demo !== true;
  const result = persistent ? hydrateSession() : { restored: false };
  const save = persistent ? scheduleAutoSave : () => undefined;
  let synchronizing = false;
  const synchronize = () => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      const cards = getCanvasCards();
      initializeDrafts(config.projectId, cards.map((card) => card.id), { persistent });
      const id = getSelectedCardId() ?? getFocusedCardId() ?? cards[0]?.id;
      if (id) activateDraftForCard(id);
    } finally {
      synchronizing = false;
    }
  };
  synchronize();
  setCanvasHistoryActivator(activateDraftForCard);
  if (persistent) enableAutoSave();
  const stopCanvas = subscribeCanvas(() => {
    synchronize();
    save();
  });
  const stopDrafts = subscribeDrafts(save);
  const stopClipboard = subscribeClipboardHandoff(save);
  const beforeunload = () => {
    flushAutoSave();
    releaseLease();
  };
  const pagehide = (event: PageTransitionEvent) => {
    flushAutoSave();
    if (!event.persisted) releaseDetachedStudies();
  };
  if (persistent) window.addEventListener("beforeunload", beforeunload);
  window.addEventListener("pagehide", pagehide);
  return {
    restored: result.restored,
    dispose() {
      flushAutoSave();
      stopCanvas();
      stopDrafts();
      stopClipboard();
      window.removeEventListener("beforeunload", beforeunload);
      window.removeEventListener("pagehide", pagehide);
      setCanvasHistoryActivator(() => undefined);
      resetAutoSave();
    },
  };
}
