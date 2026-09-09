import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  useCanvasCards,
  exitCanvas,
  exitCanvasToCard,
  addCanvasCard,
  removeCanvasCard,
  findCardByNormalizedUrl,
  focusCard,
  getSelectedCardId,
  setBoardCamera,
  getBoardCamera,
  fitAllCards,
  hasFitAllRan,
  useBoardCamera,
  type CanvasCard as CanvasCardData,
} from "./canvasStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { useCanvasMode } from "./canvasStore.ts";
import { subscribeChanges } from "../changesLog.ts";
import { recordCanvasStructuralProjectionReports } from "../structuralProjection.ts";
import { recordCanvasRenderedInstanceProjectionReports } from "../renderedInstance.ts";
import { recordCanvasTextProjectionReports } from "../textProjection.ts";
import {
  findCanvasFrameBySource,
  getRegisteredFrames,
  PROJECT_ID,
  projectToAllReadyCards,
  recordCanvasProjectionApplied,
  WORKSPACE_ID,
} from "./projection.ts";
import { normalizeUrl } from "./normalizeUrl.ts";
import {
  PROTOCOL_VERSION,
  isRendererMessageFor,
  isProjectionAppliedMessage,
  isRenderedInstanceProjectionReportMessage,
  isTextProjectionReportMessage,
  isStructuralProjectionReportMessage,
  type FrameProtocolMessage,
} from "./frameProtocol.ts";
import { iframePointToClientPoint, zoomCameraAtPointer } from "./canvasGestures.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import foundationStyles from "../ui/Foundation.css?inline";
import { useInspectorOpen } from "../openStore.ts";
import { isEditableEvent } from "../shortcuts.ts";
import { acknowledgeAgentRendererReady } from "./agentPresentation.ts";

const WORKSPACE_STYLES = [foundationStyles, canvasWorkspaceStyles, canvasCardStyles].join("\n");

export function CanvasWorkspace(): ReactElement | null {
  const mode = useCanvasMode();
  const inspectorOpen = useInspectorOpen();
  const cards = useCanvasCards();
  const camera = useBoardCamera();

  const boardRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAtPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const framePanContextRef = useRef<{ left: number; top: number; zoom: number } | null>(null);
  const spaceHeldRef = useRef(false);
  const fitAllScheduledRef = useRef(false);

  const [boardCursorClass, setBoardCursorClass] = useState("");

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

  useEffect(() => {
    return subscribeChanges(() => {
      projectToAllReadyCards();
    });
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      const frame = findCanvasFrameBySource(event.source);
      if (!frame) return;
      if (!isRendererMessageFor(event.data, {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        cardId: frame.cardId,
      })) return;

      const identity = {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        cardId: frame.cardId,
      };
      if (isProjectionAppliedMessage(event.data, identity)) {
        recordCanvasProjectionApplied(frame.cardId, event.data.revision);
        return;
      }
      if (isStructuralProjectionReportMessage(event.data, identity)) {
        recordCanvasStructuralProjectionReports(frame.cardId, event.data.revision, event.data.reports);
        return;
      }
      if (isRenderedInstanceProjectionReportMessage(event.data, identity)) {
        recordCanvasRenderedInstanceProjectionReports(frame.cardId, event.data.revision, event.data.reports);
        return;
      }
      if (isTextProjectionReportMessage(event.data, identity)) {
        recordCanvasTextProjectionReports(frame.cardId, event.data.revision, event.data.reports);
        return;
      }

      // SAFETY: isRendererMessageFor validated the frame identity and message shape above.
      const msg = event.data as FrameProtocolMessage;
      if (msg.type === "frame-ready") {
        acknowledgeAgentRendererReady(frame.cardId);
        // A card can finish loading after Space was pressed on the controller.
        // Seed it with the current modifier state before its first pointer event.
        sendPanModifier(frame.iframe, frame.cardId, spaceHeldRef.current);
      }
      if (msg.type === "pan-modifier") {
        spaceHeldRef.current = msg.spaceHeld;
        if (!panningRef.current) {
          setBoardCursorClass(msg.spaceHeld ? "is-grabbable" : "");
        }
        broadcastPanModifier(msg.spaceHeld);
        return;
      }
      if (msg.type === "zoom") {
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
      if (msg.type === "external-navigation") {
        const destination = normalizeUrl(msg.url);
        if (!destination || destination.origin === window.location.origin) return;
        exitCanvas();
        window.location.href = msg.url;
        return;
      }
      if (msg.type !== "navigation-intent") return;
      const normalized = normalizeUrl(msg.url);
      if (!normalized || normalized.origin !== window.location.origin) return;

      const existing = findCardByNormalizedUrl(normalized);
      if (existing) {
        focusCard(existing.id);
      } else {
        addCanvasCard(msg.url);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [broadcastPanModifier, endPanning, movePanning, sendPanModifier, startPanning, zoomAtPointer]);

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
      if (mode !== "canvas") return;
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
  }, [broadcastPanModifier, mode]);

  const handleBoardPointerDown = useCallback((e: React.PointerEvent) => {
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
  }, [endPanning, movePanning, startPanning]);

  useEffect(() => {
    if (mode !== "canvas") return;

    function handleGlobalWheel(e: WheelEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      zoomAtPointer({ x: e.clientX, y: e.clientY }, e.deltaY);
    }

    window.addEventListener("wheel", handleGlobalWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", handleGlobalWheel, { capture: true });
  }, [mode, zoomAtPointer]);

  function handleEdit(card: CanvasCardData): void {
    exitCanvasToCard(card);
  }

  if (mode !== "canvas" || cards.length === 0) return null;

  return (
    <>
      <style data-test="canvas-styles">{WORKSPACE_STYLES}</style>
      <div
        className="canvas-workspace"
        data-test="canvas-workspace"
        style={{ right: inspectorOpen ? "min(320px, 100vw)" : 0 }}
      >
        <div
          className={`canvas-workspace__board ${boardCursorClass}`.trim()}
          data-test="canvas-board"
          ref={boardRef}
          onPointerDown={handleBoardPointerDown}
        >
          <div
            className="canvas-workspace__board-content"
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
              transformOrigin: "0 0",
            }}
            data-test="canvas-board-content"
          >
            {cards.map((card) => (
              <CanvasCard key={card.id} card={card} onEdit={handleEdit} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
