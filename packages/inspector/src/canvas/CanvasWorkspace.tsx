import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  useCanvasCards,
  exitCanvas,
  addCanvasCard,
  findCardByNormalizedUrl,
  focusCard,
  setBoardCamera,
  getBoardCamera,
  fitAllCards,
  hasFitAllRan,
  resetFitAllFlag,
  useBoardCamera,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
  type CanvasCard as CanvasCardData,
} from "./canvasStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { getCanvasMode, setCanvasMode, useCanvasMode } from "./canvasStore.ts";
import { subscribeChanges } from "../changesLog.ts";
import {
  findCanvasFrameBySource,
  PROJECT_ID,
  projectToAllReadyCards,
  WORKSPACE_ID,
} from "./projection.ts";
import { normalizeUrl } from "./normalizeUrl.ts";
import {
  isRendererMessageFor,
  type ExternalNavigationMessage,
  type NavigationIntentMessage,
  type PanEndMessage,
  type PanMoveMessage,
  type PanStartMessage,
} from "./frameProtocol.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import foundationStyles from "../ui/Foundation.css?inline";
import { Maximize } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { useInspectorOpen } from "../openStore.ts";

const WORKSPACE_STYLES = [foundationStyles, canvasWorkspaceStyles, canvasCardStyles].join("\n");

const ZOOM_STEP = 0.1;
const ZOOM_WHEEL_FACTOR = 1.08;

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

      const msg = event.data as NavigationIntentMessage | ExternalNavigationMessage | PanStartMessage | PanMoveMessage | PanEndMessage;
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
  }, [endPanning, movePanning, startPanning]);

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
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        spaceHeldRef.current = true;
        if (!panningRef.current) {
          setBoardCursorClass("is-grabbable");
        }
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        if (!panningRef.current) {
          setBoardCursorClass("");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode]);

  const handleBoardPointerDown = useCallback((e: React.PointerEvent) => {
    if (panningRef.current) return;

    if (!spaceHeldRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    startPanning({ x: e.clientX, y: e.clientY });

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

      const boardEl = boardRef.current;
      if (!boardEl) return;

      const rect = boardEl.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      const cam = getCanvasMode() === "canvas" ? getBoardCamera() : { x: 0, y: 0, zoom: 1 };

      const worldX = (pointerX - cam.x) / cam.zoom;
      const worldY = (pointerY - cam.y) / cam.zoom;

      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      const newZoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cam.zoom * factor));

      const newX = pointerX - worldX * newZoom;
      const newY = pointerY - worldY * newZoom;

      setBoardCamera({ x: newX, y: newY, zoom: newZoom });
    }

    window.addEventListener("wheel", handleGlobalWheel, { capture: true });
    return () => window.removeEventListener("wheel", handleGlobalWheel, { capture: true });
  }, [mode]);

  const handleFitAll = useCallback(() => {
    fitCanvasToBoard();
  }, [fitCanvasToBoard]);

  function handleEdit(card: CanvasCardData): void {
    setCanvasMode("inspect");
    resetFitAllFlag();
    if (card.url !== window.location.href) {
      window.location.href = card.url;
    }
  }

  if (mode !== "canvas" || cards.length === 0) return null;

  return (
    <>
      <style data-test="canvas-styles">{WORKSPACE_STYLES}</style>
      <div
        className="dt-canvas-workspace"
        data-test="canvas-workspace"
        style={{ right: inspectorOpen ? "min(320px, 100vw)" : 0 }}
      >
        <div className="dt-canvas-workspace__header">
          <span className="dt-canvas-workspace__title">Canvas</span>
          <div className="dt-canvas-workspace__header-actions">
            <Button
              variant="secondary"
              size="compact"
              aria-label="Fit all cards"
              data-test="canvas-fit-all"
              onClick={handleFitAll}
            >
              <Maximize size={14} strokeWidth={1.8} aria-hidden="true" />
              Fit All
            </Button>
            <Button
              variant="secondary"
              size="compact"
              aria-label="Exit Canvas"
              data-test="canvas-exit"
              onClick={() => exitCanvas()}
            >
              Exit Canvas
            </Button>
          </div>
        </div>
        <div
          className={`dt-canvas-workspace__board ${boardCursorClass}`.trim()}
          data-test="canvas-board"
          ref={boardRef}
          onPointerDown={handleBoardPointerDown}
        >
          <div
            className="dt-canvas-workspace__board-content"
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
