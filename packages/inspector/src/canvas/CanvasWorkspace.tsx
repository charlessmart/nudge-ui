import { useCallback, useEffect, useRef, type ReactElement } from "react";
import {
  useCanvasCards,
  exitCanvas,
  addCanvasCard,
  findCardByNormalizedUrl,
  focusCard,
  setBoardCamera,
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
import { projectToAllReadyCards } from "./projection.ts";
import { normalizeUrl } from "./normalizeUrl.ts";
import { PROTOCOL_VERSION, type NavigationIntentMessage } from "./frameProtocol.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import { Maximize } from "lucide-react";

const WORKSPACE_STYLES = [canvasWorkspaceStyles, canvasCardStyles].join("\n");

const ZOOM_STEP = 0.1;
const ZOOM_WHEEL_FACTOR = 1.08;

export function CanvasWorkspace(): ReactElement | null {
  const mode = useCanvasMode();
  const cards = useCanvasCards();
  const camera = useBoardCamera();

  const boardRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAtPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const fitAllScheduledRef = useRef(false);

  useEffect(() => {
    return subscribeChanges(() => {
      projectToAllReadyCards();
    });
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type !== "navigation-intent") return;
      if (event.data.protocolVersion !== PROTOCOL_VERSION) return;

      const msg = event.data as NavigationIntentMessage;
      const normalized = normalizeUrl(msg.url);
      if (!normalized) return;

      const existing = findCardByNormalizedUrl(normalized);
      if (existing) {
        focusCard(existing.id);
      } else {
        addCanvasCard(msg.url);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (mode === "canvas" && !hasFitAllRan()) {
      if (!fitAllScheduledRef.current) {
        fitAllScheduledRef.current = true;
        requestAnimationFrame(() => {
          fitAllCards();
          fitAllScheduledRef.current = false;
        });
      }
    }
  }, [mode, cards.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (mode !== "canvas") return;
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        spaceHeldRef.current = true;
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
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
    panningRef.current = true;
    panOriginRef.current = { x: e.clientX, y: e.clientY };
    const currentCamera = getCanvasMode() === "canvas" ? { ...cameraAtPanStartRef.current } : { x: 0, y: 0 };
    cameraAtPanStartRef.current = {
      x: camera.x,
      y: camera.y,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent): void {
      if (!panningRef.current) return;
      const dx = ev.clientX - panOriginRef.current.x;
      const dy = ev.clientY - panOriginRef.current.y;
      setBoardCamera({
        x: cameraAtPanStartRef.current.x + dx,
        y: cameraAtPanStartRef.current.y + dy,
        zoom: camera.zoom,
      });
    }

    function onUp(): void {
      panningRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [camera.zoom, camera.x, camera.y]);

  const handleBoardWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const boardEl = boardRef.current;
    if (!boardEl) return;

    const rect = boardEl.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    const worldX = (pointerX - camera.x) / camera.zoom;
    const worldY = (pointerY - camera.y) / camera.zoom;

    const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    const newZoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, camera.zoom * factor));

    const newX = pointerX - worldX * newZoom;
    const newY = pointerY - worldY * newZoom;

    setBoardCamera({ x: newX, y: newY, zoom: newZoom });
  }, [camera.x, camera.y, camera.zoom]);

  const handleFitAll = useCallback(() => {
    fitAllCards();
  }, []);

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
      <div className="dt-canvas-workspace" data-test="canvas-workspace">
        <div className="dt-canvas-workspace__header">
          <span className="dt-canvas-workspace__title">Canvas</span>
          <div className="dt-canvas-workspace__header-actions">
            <button
              type="button"
              className="dt-canvas-workspace__fit-all"
              aria-label="Fit all cards"
              data-test="canvas-fit-all"
              onClick={handleFitAll}
            >
              <Maximize size={14} strokeWidth={1.8} aria-hidden="true" />
              Fit All
            </button>
            <button
              type="button"
              className="dt-canvas-workspace__exit"
              aria-label="Exit Canvas"
              data-test="canvas-exit"
              onClick={() => exitCanvas()}
            >
              Exit Canvas
            </button>
          </div>
        </div>
        <div
          className="dt-canvas-workspace__board"
          data-test="canvas-board"
          ref={boardRef}
          onPointerDown={handleBoardPointerDown}
          onWheel={handleBoardWheel}
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
