import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { IconCornerLeftUp } from "@tabler/icons-react";
import {
  useCanvasCards,
  activateIframeWorkspace,
  removeCanvasCard,
  getSelectedCardId,
  getFocusedCardId,
  getCanvasCards,
  setBoardCamera,
  getBoardCamera,
  fitAllCards,
  setCanvasPresentation,
  focusCard,
  hasFitAllRan,
  useBoardCamera,
  useCanvasPresentation,
  useCanvasPresentationTransitioning,
  useSelectedCardId,
  useFocusedCardId,
  resizeCard,
  setCardPosition,
  updateCardTitle,
  CARD_GAP,
  type CanvasCard as CanvasCardData,
  updateCardUrl,
} from "./canvasStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { Button } from "../ui/Button.tsx";
import { useCanvasMode } from "./canvasStore.ts";
import { subscribeChanges } from "../changes/changesLog.ts";
import { recordCanvasStructuralProjectionReports } from "../projection/structuralProjection.ts";
import { recordCanvasRenderedInstanceProjectionReports } from "../projection/renderedInstance.ts";
import { recordCanvasTextProjectionReports } from "../projection/textProjection.ts";
import { getChangesList, isPreviewableChange } from "../changes/changesLog.ts";
import { changeKey } from "../changes/model.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { beginPreviewAttempt, publishPreviewDiagnostic } from "../changes/previewDiagnostics.ts";
import { verifyManagedStyleProjection } from "../changes/managedStyleProjection.ts";
import {
  getCanvasPreviewDocument,
  getRegisteredFrames,
  isCanvasCanonicalProjectionRevisionCurrent,
  PROJECT_ID,
  projectToAllReadyCards,
  recordCanvasProjectionApplied,
  WORKSPACE_ID,
} from "./projection.ts";
import { normalizeUrl } from "./normalizeUrl.ts";
import { createNudgeUiEditorUrl } from "../../transport/editor.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import {
  PROTOCOL_VERSION,
  isProjectionAppliedMessage,
  isRenderedInstanceProjectionReportMessage,
  isTextProjectionReportMessage,
  isStructuralProjectionReportMessage,
} from "./frameProtocol.ts";
import { iframePointToClientPoint, zoomCameraAtPointer } from "./canvasGestures.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import foundationStyles from "../ui/Foundation.css?inline";
import { useInspectorOpen } from "../shell/openStore.ts";
import { isEditableEvent } from "../shell/shortcuts.ts";
import { acknowledgeAgentRendererReady } from "./agentPresentation.ts";
import { useInspectorSession } from "../session/sessionContext.tsx";
import { createNudgeUiDirectUrl } from "../../transport/editor.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";

const WORKSPACE_STYLES = [foundationStyles, canvasWorkspaceStyles, canvasCardStyles].join("\n");

export interface CanvasWorkspaceProps {
  readonly primaryUrl: string | null;
}

export function CanvasWorkspace({ primaryUrl }: CanvasWorkspaceProps): ReactElement | null {
  const mode = useCanvasMode();
  const runtimeConfig = useNudgeUiRuntimeConfig();
  const inspectorSession = useInspectorSession();
  const inspectorOpen = useInspectorOpen();
  const cards = useCanvasCards();
  const camera = useBoardCamera();
  const presentation = useCanvasPresentation();
  const presentationTransitioning = useCanvasPresentationTransitioning();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();

  const boardRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAtPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const framePanContextRef = useRef<{ left: number; top: number; zoom: number } | null>(null);
  const spaceHeldRef = useRef(false);
  const fitAllScheduledRef = useRef(false);
  const activatedTargetRef = useRef<string | null>(null);
  const demoSeededRef = useRef(false);

  const [boardCursorClass, setBoardCursorClass] = useState("");
  const presentationCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id ?? null;

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!primaryUrl || !board) return;
    if (activatedTargetRef.current === primaryUrl && cards.length > 0) return;
    activatedTargetRef.current = primaryUrl;
    const viewport = {
      width: board.clientWidth,
      height: board.clientHeight,
    };
    const primaryCard = activateIframeWorkspace(primaryUrl, viewport);
    if (runtimeConfig.demo === true && primaryCard && !demoSeededRef.current) {
      demoSeededRef.current = true;
      const demoPages = runtimeConfig.demoPages ?? [];
      const demoCardLabels = runtimeConfig.demoCardLabels ?? [];
      const orderedDemoCards = demoCardLabels.length > 0;
      const seededCards: CanvasCardData[] = [];
      const demoCardWidth = primaryCard.width;
      let nextX = 0;
      for (const [index, route] of demoPages.entries()) {
        const url = new URL(route, primaryUrl);
        if (url.origin !== window.location.origin) continue;
        const card = activateIframeWorkspace(url.href, viewport);
        if (!card) continue;
        resizeCard(card.id, demoCardWidth, 900);
        seededCards.push(card);
        if (!orderedDemoCards) {
          setCardPosition(card.id, nextX, 0);
          nextX += demoCardWidth + CARD_GAP;
        }
        if (orderedDemoCards && demoCardLabels[index]) {
          updateCardTitle(card.id, demoCardLabels[index]);
        }
      }
      if (orderedDemoCards) {
        resizeCard(primaryCard.id, demoCardWidth, primaryCard.height);
        let layoutX = 0;
        const orderedCardIds = new Set([...seededCards.map((card) => card.id), primaryCard.id]);
        for (const cardId of orderedCardIds) {
          const card = getCanvasCards().find((candidate) => candidate.id === cardId);
          if (!card) continue;
          setCardPosition(card.id, layoutX, 0);
          layoutX += card.width + CARD_GAP;
        }
        const primaryLabel = demoCardLabels[demoPages.length];
        if (primaryLabel) updateCardTitle(primaryCard.id, primaryLabel);
      }
      focusCard(primaryCard.id);
    }
  }, [primaryUrl, cards.length, runtimeConfig.demo, runtimeConfig.demoPages, runtimeConfig.demoCardLabels]);

  useEffect(() => {
    if (primaryUrl && activatedTargetRef.current !== primaryUrl) return;
    const activeCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id;
    const activeCard = cards.find((card) => card.id === activeCardId);
    if (!activeCard) return;
    const editorUrl = createNudgeUiEditorUrl(activeCard.url);
    if (window.location.href !== editorUrl) {
      window.history.replaceState(window.history.state, "", editorUrl);
    }
  }, [cards, focusedCardId, primaryUrl, selectedCardId]);

  const sendPanModifier = useCallback((iframe: HTMLIFrameElement, cardId: string, spaceHeld: boolean) => {
    iframe.contentWindow?.postMessage({
      type: "pan-modifier",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      spaceHeld,
    }, window.location.origin);
  }, []);

  const sendInspectorInteractionState = useCallback((
    iframe: HTMLIFrameElement,
    cardId: string,
    open: boolean,
  ) => {
    iframe.contentWindow?.postMessage({
      type: "inspector-interaction-state",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      open,
    }, window.location.origin);
  }, []);

  const sendBoardGestureState = useCallback((iframe: HTMLIFrameElement, cardId: string, enabled: boolean) => {
    iframe.contentWindow?.postMessage({
      type: "board-gesture-state",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      enabled,
    }, window.location.origin);
  }, []);

  useEffect(() => {
    for (const [cardId, iframe] of getRegisteredFrames()) {
      sendInspectorInteractionState(iframe, cardId, inspectorOpen);
      sendBoardGestureState(iframe, cardId, presentation === "canvas");
    }
  }, [inspectorOpen, presentation, sendBoardGestureState, sendInspectorInteractionState]);

  const broadcastPanModifier = useCallback((spaceHeld: boolean) => {
    for (const [cardId, iframe] of getRegisteredFrames()) {
      sendPanModifier(iframe, cardId, spaceHeld);
    }
  }, [sendPanModifier]);

  const zoomAtPointer = useCallback((point: { x: number; y: number }, deltaY: number) => {
    const board = boardRef.current;
    if (!board) return;
    setBoardCamera(zoomCameraAtPointer(
      getBoardCamera(),
      point,
      board.getBoundingClientRect(),
      deltaY,
    ));
  }, []);

  const fitCanvasToBoard = useCallback(() => {
    const board = boardRef.current;
    fitAllCards(board ? { width: board.clientWidth, height: board.clientHeight } : undefined);
  }, []);

  const startPanning = useCallback((point: { x: number; y: number }) => {
    if (panningRef.current) return;
    panningRef.current = true;
    setBoardCursorClass("is-grabbing");
    panOriginRef.current = point;
    const current = getBoardCamera();
    cameraAtPanStartRef.current = { x: current.x, y: current.y };
  }, []);

  const movePanning = useCallback((point: { x: number; y: number }) => {
    if (!panningRef.current) return;
    const cameraAtStart = cameraAtPanStartRef.current;
    const current = getBoardCamera();
    setBoardCamera({
      x: cameraAtStart.x + point.x - panOriginRef.current.x,
      y: cameraAtStart.y + point.y - panOriginRef.current.y,
      zoom: current.zoom,
    });
  }, []);

  const endPanning = useCallback(() => {
    if (!panningRef.current) return;
    panningRef.current = false;
    setBoardCursorClass(spaceHeldRef.current ? "is-grabbable" : "");
  }, []);

  useLayoutEffect(() => {
    if (presentation !== "focus") return;
    endPanning();
    spaceHeldRef.current = false;
    setBoardCursorClass("");
    broadcastPanModifier(false);
  }, [broadcastPanModifier, endPanning, presentation]);

  useEffect(() => {
    return subscribeChanges(() => {
      projectToAllReadyCards();
    });
  }, []);

  useEffect(() => {
    return subscribeCanvasRendererMessages(({ cardId, iframe, identity, message: msg }) => {
      if (msg.type === "renderer-hello") return;
      const frame = { cardId, iframe };
      const syncActiveFrameUrl = (url: string): void => {
        updateCardUrl(frame.cardId, url);
        const activeCardId = getSelectedCardId() ?? getFocusedCardId() ?? getCanvasCards()[0]?.id;
        if (activeCardId !== frame.cardId && getCanvasCards().length !== 1) return;
        window.history.replaceState(window.history.state, "", createNudgeUiEditorUrl(url));
      };
      if (isProjectionAppliedMessage(msg, identity)) {
        recordCanvasProjectionApplied(frame.cardId, msg.revision);
        const frameDocument = frame.iframe.contentDocument;
        if (frameDocument && isCanvasCanonicalProjectionRevisionCurrent(frameDocument, msg.revision)) {
          const attempt = beginPreviewAttempt(
            getCanvasPreviewDocument(frame.cardId),
            getWorkspaceChanges().revision,
          );
          if (attempt) {
            for (const change of getChangesList()) {
              if (!isPreviewableChange(change)) continue;
              const result = verifyManagedStyleProjection(change, null, frameDocument);
              if (result) {
                publishPreviewDiagnostic(attempt, changeKey(change), result);
                if (result.status === "conflict" && result.reason === "animation") {
                  window.setTimeout(() => {
                    if (!isCanvasCanonicalProjectionRevisionCurrent(frameDocument, msg.revision)) return;
                    const settled = verifyManagedStyleProjection(change, null, frameDocument);
                    if (settled) publishPreviewDiagnostic(attempt, changeKey(change), settled);
                  }, 300);
                }
              }
            }
          }
        }
        return;
      }
      if (isStructuralProjectionReportMessage(msg, identity)) {
        recordCanvasStructuralProjectionReports(frame.cardId, msg.revision, msg.reports);
        return;
      }
      if (isRenderedInstanceProjectionReportMessage(msg, identity)) {
        recordCanvasRenderedInstanceProjectionReports(frame.cardId, msg.revision, msg.reports);
        return;
      }
      if (isTextProjectionReportMessage(msg, identity)) {
        recordCanvasTextProjectionReports(frame.cardId, msg.revision, msg.reports);
        return;
      }
      if (msg.type === "frame-ready") {
        acknowledgeAgentRendererReady(frame.cardId);
        syncActiveFrameUrl(msg.url);
        // A card can finish loading after Space was pressed on the controller.
        // Seed it with the current modifier state before its first pointer event.
        sendPanModifier(frame.iframe, frame.cardId, spaceHeldRef.current);
        sendInspectorInteractionState(frame.iframe, frame.cardId, inspectorOpen);
        sendBoardGestureState(frame.iframe, frame.cardId, presentation === "canvas");
      }
      if (msg.type === "pan-modifier") {
        if (presentation !== "canvas") return;
        spaceHeldRef.current = msg.spaceHeld;
        if (!panningRef.current) {
          setBoardCursorClass(msg.spaceHeld ? "is-grabbable" : "");
        }
        broadcastPanModifier(msg.spaceHeld);
        return;
      }
      if (msg.type === "zoom") {
        if (presentation !== "canvas") return;
        const iframeRect = frame.iframe.getBoundingClientRect();
        const point = iframePointToClientPoint(iframeRect, msg.point, getBoardCamera().zoom);
        zoomAtPointer(point, msg.deltaY);
        return;
      }
      const pointInBoard = (point: { x: number; y: number }) => {
        const context = framePanContextRef.current;
        if (!context) return null;
        return {
          x: context.left + point.x * context.zoom,
          y: context.top + point.y * context.zoom,
        };
      };
      if (msg.type === "pan-start") {
        const iframeRect = frame.iframe.getBoundingClientRect();
        framePanContextRef.current = {
          left: iframeRect.left,
          top: iframeRect.top,
          zoom: getBoardCamera().zoom,
        };
        const point = pointInBoard(msg.point);
        if (point) startPanning(point);
        return;
      }
      if (msg.type === "pan-move") {
        const point = pointInBoard(msg.point);
        if (point) movePanning(point);
        return;
      }
      if (msg.type === "pan-end") {
        framePanContextRef.current = null;
        endPanning();
        return;
      }
      if (msg.type === "frame-metadata") {
        const frameDocument = frame.iframe.contentDocument;
        if (frameDocument) disposeInlineTextEdit("route-disposed", frameDocument);
        if (msg.url) syncActiveFrameUrl(msg.url);
        return;
      }
      if (msg.type !== "navigation-intent") return;
      const normalized = normalizeUrl(msg.url);
      if (!normalized || normalized.origin !== window.location.origin) return;

      const frameDocument = frame.iframe.contentDocument;
      if (frameDocument) disposeInlineTextEdit("route-disposed", frameDocument);
    });
  }, [broadcastPanModifier, endPanning, inspectorOpen, movePanning, presentation, sendBoardGestureState, sendInspectorInteractionState, sendPanModifier, startPanning, zoomAtPointer]);

  useEffect(() => {
    if (mode === "canvas" && !hasFitAllRan()) {
      if (!fitAllScheduledRef.current) {
        fitAllScheduledRef.current = true;
        requestAnimationFrame(() => {
          fitCanvasToBoard();
          fitAllScheduledRef.current = false;
        });
      }
    }
  }, [mode, cards.length, inspectorOpen, fitCanvasToBoard]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (mode !== "canvas" || presentation !== "canvas") return;
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditableEvent(e)) {
        const selectedCardId = getSelectedCardId();
        if (!selectedCardId) return;
        e.preventDefault();
        removeCanvasCard(selectedCardId);
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        // SAFETY: keyboard event targets are HTMLElements in the workspace DOM.
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        e.preventDefault();
        spaceHeldRef.current = true;
        broadcastPanModifier(true);
        if (!panningRef.current) {
          setBoardCursorClass("is-grabbable");
        }
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        broadcastPanModifier(false);
        if (!panningRef.current) {
          setBoardCursorClass("");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [broadcastPanModifier, mode, presentation]);

  const handleBoardPointerDown = useCallback((e: React.PointerEvent) => {
    if (presentation !== "canvas") return;
    if (panningRef.current) return;

    if (!spaceHeldRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    startPanning({ x: e.clientX, y: e.clientY });

    // SAFETY: pointerdown targets are HTMLElements in the workspace DOM.
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent): void {
      movePanning({ x: ev.clientX, y: ev.clientY });
    }

    function onUp(): void {
      endPanning();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [endPanning, movePanning, presentation, startPanning]);

  useEffect(() => {
    if (mode !== "canvas" || presentation !== "canvas") return;

    function handleGlobalWheel(e: WheelEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      zoomAtPointer({ x: e.clientX, y: e.clientY }, e.deltaY);
    }

    window.addEventListener("wheel", handleGlobalWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", handleGlobalWheel, { capture: true });
  }, [mode, presentation, zoomAtPointer]);

  const showCanvas = useCallback(() => {
    setCanvasPresentation("canvas");
  }, []);

  const showFocus = useCallback((cardId: string) => {
    focusCard(cardId);
    setCanvasPresentation("focus");
  }, []);

  function handleOpenApp(card: CanvasCardData): void {
    window.open(createNudgeUiDirectUrl(card.url), "_blank", "noopener,noreferrer");
  }

  if (mode !== "canvas") return null;

  return (
    <>
      <style data-test="canvas-styles">{WORKSPACE_STYLES}</style>
      <div
        className={`canvas-workspace${presentationTransitioning ? " is-presentation-transitioning" : ""}`}
        data-test="canvas-workspace"
        data-presentation={presentation}
        style={{ right: inspectorOpen ? "min(320px, 100vw)" : 0 }}
      >
        <div
          className={`canvas-workspace__board ${boardCursorClass}`.trim()}
          data-test="canvas-board"
          ref={boardRef}
          onPointerDown={handleBoardPointerDown}
        >
          {!primaryUrl ? (
            <div className="canvas-workspace__target-error" data-test="canvas-target-error">
              This editor URL does not identify an application page.
            </div>
          ) : null}
          {inspectorOpen && presentation === "focus" ? (
            <div className="canvas-workspace__focus-action" data-test="canvas-show-canvas">
              <Button
                variant="quiet"
                size="default"
                type="button"
                onClick={showCanvas}
              >
                <IconCornerLeftUp size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                Canvas
              </Button>
            </div>
          ) : null}
          <div
            className="canvas-workspace__board-content"
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
              transformOrigin: "0 0",
            }}
            data-test="canvas-board-content"
          >
            {cards.map((card) => (
              <CanvasCard
                key={card.id}
                card={card}
                presentation={presentation}
                presentationCard={card.id === presentationCardId}
                onOpenApp={handleOpenApp}
                onShowFocus={showFocus}
                documentOwner={inspectorSession}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
