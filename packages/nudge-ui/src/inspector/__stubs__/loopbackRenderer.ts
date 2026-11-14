import { activateDraftForCard, subscribeActiveDraftChanges, getActiveDraftChanges } from "../drafts/store.ts";
import { activateIframeWorkspace, removeCanvasCard } from "../canvas/canvasStore.ts";
import type { CanvasFrame } from "../canvas/canvasFrame.ts";
import type { ReplaceStylesMessage } from "../canvas/frameProtocol.ts";
import { recordCanvasProjectionApplied, registerCardFrame, resetProjectionRevision, unregisterCardFrame } from "../canvas/projection.ts";
import { applyRendererProjection } from "../canvas/rendererStylesheet.ts";
import { compileDraftProjection } from "../projection/draftProjection.ts";
import { isOriginalPreviewActive, subscribeOriginalPreview } from "../shell/originalPreview.ts";

/**
 * Test-only. Production previews a draft by sending it to a frame's renderer; unit tests have no frame, so this
 * applies the active draft to the test document with the renderer's own code, minus the message hop.
 */
export function installLoopbackRenderer(): () => void {
  const project = (): void => {
    // A test marks the document as the editor shell to say the application lives in a frame.
    if (document.documentElement.hasAttribute("data-nudge-ui-editor")) return;
    const plan = compileDraftProjection(getActiveDraftChanges());
    applyRendererProjection(isOriginalPreviewActive()
      ? { sourceRevision: plan.sourceRevision, managedStyles: { css: "" }, instanceOverrides: [], structuralChanges: [], textContentChanges: [], componentOverrides: [] }
      : plan);
  };
  const stopDrafts = subscribeActiveDraftChanges(project);
  const stopPeek = subscribeOriginalPreview(project);
  return () => {
    stopDrafts();
    stopPeek();
  };
}

/**
 * Test-only. Registers the test document as the frame of a new card for the current URL, so code that looks a
 * document up by its card (handoff verification) finds it. Projections sent to the card apply and acknowledge at once.
 */
export function attachLoopbackFrame(): () => void {
  const card = activateIframeWorkspace(window.location.href, { width: 800, height: 600 }, { undoable: false });
  if (!card) throw new Error("The test URL cannot host a card.");
  const cardId = card.id;
  const root = document.documentElement;
  const frame: CanvasFrame = {
    // SAFETY: the controller only posts messages to a frame's window.
    contentWindow: {
      postMessage(message: ReplaceStylesMessage): void {
        if (message.type !== "replace-styles") return;
        applyRendererProjection({
          sourceRevision: message.revision,
          managedStyles: { css: message.css },
          instanceOverrides: message.instanceOverrides,
          structuralChanges: message.structuralChanges,
          textContentChanges: message.textContentChanges,
          componentOverrides: message.componentOverrides,
          runtimeIdentities: message.runtimeIdentities,
        });
        recordCanvasProjectionApplied(cardId, message.revision);
      },
    } as unknown as Window,
    contentDocument: document,
    isConnected: true,
    clientWidth: root.clientWidth,
    clientHeight: root.clientHeight,
    getBoundingClientRect: () => new DOMRect(0, 0, root.clientWidth, root.clientHeight),
  };
  registerCardFrame(cardId, frame);
  // Edits a test makes next belong to this document's draft.
  activateDraftForCard(cardId);
  return () => {
    unregisterCardFrame(cardId);
    removeCanvasCard(cardId);
    // Plans are cached by draft revision, which restarts when a test resets its drafts.
    resetProjectionRevision();
  };
}
