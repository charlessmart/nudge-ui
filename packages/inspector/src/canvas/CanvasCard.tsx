import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";
import { removeCanvasCard, duplicateCard, updateCardTitle, updateCardUrl, resizeCard, setCardPosition, selectCard, useSelectedCardId, useBoardCamera, type CanvasCard } from "./canvasStore.ts";
import { RefreshCw, Trash2, Pencil, Copy } from "lucide-react";
import { PROTOCOL_VERSION, type FrameReadyMessage, type FrameMetadataMessage, type FrameLoadError } from "./frameProtocol.ts";
import { registerCardFrame, unregisterCardFrame, sendProjectionToCard, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { IconButton } from "../ui/IconButton.tsx";

interface CanvasCardProps {
  card: CanvasCard;
  onEdit?: (card: CanvasCard) => void;
}

type CardLoadState = "loading" | "ready" | "error";

const MIN_CARD_WIDTH = 200;
const MIN_CARD_HEIGHT = 150;

export function CanvasCard({ card, onEdit }: CanvasCardProps): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadState, setLoadState] = useState<CardLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const camera = useBoardCamera();
  const selectedCardId = useSelectedCardId();
  const isSelected = selectedCardId === card.id;

  function handleReload(): void {
    if (iframeRef.current) {
      setLoadState("loading");
      setErrorMessage(null);
      iframeRef.current.src = iframeRef.current.src;
    }
  }

  function handleRemove(): void {
    removeCanvasCard(card.id);
  }

  function handleEdit(): void {
    onEdit?.(card);
  }

  function handleDuplicate(): void {
    duplicateCard(card.id);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (typeof msg.protocolVersion !== "number" || msg.protocolVersion !== PROTOCOL_VERSION) return;

      if (msg.type === "frame-ready") {
        const ready = msg as FrameReadyMessage;
        setLoadState("ready");
        setErrorMessage(null);
        if (ready.title) updateCardTitle(card.id, ready.title);
        if (ready.url) updateCardUrl(card.id, ready.url);
        if (iframeRef.current) {
          registerCardFrame(card.id, iframeRef.current);
          sendProjectionToCard(card, iframeRef.current);
        }
        return;
      }

      if (msg.type === "frame-metadata") {
        const meta = msg as FrameMetadataMessage;
        if (meta.title) updateCardTitle(card.id, meta.title);
        if (meta.url) updateCardUrl(card.id, meta.url);
        return;
      }

      if (msg.type === "frame-error") {
        const err = msg as FrameLoadError;
        setLoadState("error");
        setErrorMessage(err.message || "Frame failed to load");
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      unregisterCardFrame(card.id);
    };
  }, [card.id]);

  useEffect(() => {
    if (loadState !== "loading") return;
    const timeout = setTimeout(() => {
      setLoadState("error");
      setErrorMessage("Frame load timed out");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loadState]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    function onLoad(): void {
      iframeRef.current?.contentWindow?.postMessage({
        type: "parent-ready",
        protocolVersion: PROTOCOL_VERSION,
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        cardId: card.id,
      }, window.location.origin);
    }
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [card.id]);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, cardX: 0, cardY: 0 });

  const handleToolbarPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    selectCard(card.id);

    e.stopPropagation();
    e.preventDefault();

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      cardX: card.x,
      cardY: card.y,
    };
    setIsDragging(true);

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent): void {
      const dx = (ev.clientX - dragRef.current.startX) / camera.zoom;
      const dy = (ev.clientY - dragRef.current.startY) / camera.zoom;
      setCardPosition(card.id, dragRef.current.cardX + dx, dragRef.current.cardY + dy);
    }

    function onUp(): void {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [card.id, card.x, card.y, camera.zoom]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = card.width;
    const startHeight = card.height;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent): void {
      const dx = (ev.clientX - startX) / camera.zoom;
      const dy = (ev.clientY - startY) / camera.zoom;

      const newWidth = Math.max(MIN_CARD_WIDTH, startWidth + dx);
      const newHeight = Math.max(MIN_CARD_HEIGHT, startHeight + dy);

      resizeCard(card.id, newWidth, newHeight);
    }

    function onUp(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [card.id, card.width, card.height, camera.zoom]);

  return (
    <div
      className={`dt-canvas-card${isDragging ? " is-dragging" : ""}${isSelected ? " is-selected" : ""}`}
      data-card-id={card.id}
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="dt-canvas-card__toolbar" onPointerDown={handleToolbarPointerDown}>
        <span className="dt-canvas-card__title" title={card.url}>
          {card.title || card.url}
        </span>
        <div className="dt-canvas-card__actions">
          <IconButton
            label="Duplicate card"
            variant="quiet"
            size="compact"
            data-test={`canvas-card-duplicate-${card.id}`}
            onClick={handleDuplicate}
          >
            <Copy size={14} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Edit this route"
            variant="quiet"
            size="compact"
            data-test={`canvas-card-edit-${card.id}`}
            onClick={handleEdit}
          >
            <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Reload card"
            variant="quiet"
            size="compact"
            data-test={`canvas-card-reload-${card.id}`}
            onClick={handleReload}
          >
            <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Remove card"
            variant="danger"
            size="compact"
            data-test={`canvas-card-remove-${card.id}`}
            onClick={handleRemove}
          >
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="dt-canvas-card__frame">
        {loadState === "loading" ? (
          <div className="dt-canvas-card__loading" data-test={`canvas-card-loading-${card.id}`}>
            Loading preview...
          </div>
        ) : loadState === "error" ? (
          <div className="dt-canvas-card__error" data-test={`canvas-card-error-${card.id}`}>
            <p>{errorMessage || "Frame could not be loaded"}</p>
            <div className="dt-canvas-card__error-actions">
              <button type="button" onClick={handleReload}>Retry</button>
              <button type="button" onClick={handleRemove}>Remove</button>
            </div>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          className="dt-canvas-card__iframe"
          src={card.url}
          title={card.title || card.url}
          {...{ [CANVAS_RENDERER_ATTR]: "" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          data-test={`canvas-card-iframe-${card.id}`}
        />
      </div>
      <div
        className="dt-canvas-card__resize-handle"
        data-test={`canvas-card-resize-${card.id}`}
        onPointerDown={handleResizeStart}
        role="button"
        aria-label="Resize card"
        tabIndex={0}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M11 1L1 11" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 6L6 11" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11H1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
