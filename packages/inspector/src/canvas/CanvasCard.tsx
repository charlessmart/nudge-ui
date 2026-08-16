import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";
import { removeCanvasCard, duplicateCard, updateCardTitle, updateCardUrl, resizeCard, setCardPosition, selectCard, getSelectedCardId, useSelectedCardId, useFocusedCardId, useBoardCamera, type CanvasCard } from "./canvasStore.ts";
import { IconRefresh, IconPlayerPlay, IconCopy, IconArrowsDiagonal } from "@tabler/icons-react";
import {
  PROTOCOL_VERSION,
  isRendererMessageFor,
  type FrameProtocolMessage,
} from "./frameProtocol.ts";
import { registerCardFrame, registerCardFrameSource, unregisterCardFrame, sendProjectionToCard, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { Button } from "../ui/Button.tsx";
import { setSelectedElement } from "../selectionStore.ts";
import { clearCanvasStructuralProjectionReports } from "../structuralProjection.ts";
import { clearCanvasRenderedInstanceProjectionReports } from "../renderedInstance.ts";
import { getCanvasToolbarScale } from "./toolbarScale.ts";

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
  const focusedCardId = useFocusedCardId();
  const isSelected = selectedCardId === card.id;
  const isFocused = focusedCardId === card.id;
  const toolbarScale = getCanvasToolbarScale(camera.zoom);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    registerCardFrameSource(card.id, iframe);
    return () => unregisterCardFrame(card.id);
  }, [card.id]);

  function handleReload(): void {
    if (iframeRef.current) {
      if (getSelectedCardId() === card.id) setSelectedElement(null);
      setLoadState("loading");
      setErrorMessage(null);
      iframeRef.current.src = iframeRef.current.src;
    }
  }

  function handleRemove(): void {
    if (getSelectedCardId() === card.id) setSelectedElement(null);
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

      if (!isRendererMessageFor(msg, {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        cardId: card.id,
      })) return;

      // SAFETY: isRendererMessageFor validated the frame identity and message shape above.
      const data = msg as FrameProtocolMessage;

      if (data.type === "frame-ready") {
        setLoadState("ready");
        setErrorMessage(null);
        if (data.title) updateCardTitle(card.id, data.title);
        if (data.url) updateCardUrl(card.id, data.url);
        if (iframeRef.current) {
          registerCardFrame(card.id, iframeRef.current);
          sendProjectionToCard(card, iframeRef.current);
        }
        return;
      }

      if (data.type === "frame-metadata") {
        if (data.title) updateCardTitle(card.id, data.title);
        if (data.url) updateCardUrl(card.id, data.url);
        return;
      }

      if (data.type === "frame-error") {
        setLoadState("error");
        setErrorMessage(data.message || "Frame failed to load");
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
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
      if (getSelectedCardId() === card.id) setSelectedElement(null);
      // A reload creates a new renderer document; do not show diagnostics
      // produced by the old frame while its replacement is handshaking.
      clearCanvasStructuralProjectionReports(card.id);
      clearCanvasRenderedInstanceProjectionReports(card.id);
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
    // SAFETY: pointer events on the card target are HTMLElements in this DOM context.
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    if (getSelectedCardId() !== card.id) setSelectedElement(null);
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

    // SAFETY: pointerdown targets are HTMLElements in the card DOM.
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

  const handleCardPointerDown = useCallback(() => {
    if (getSelectedCardId() !== card.id) setSelectedElement(null);
    selectCard(card.id);
  }, [card.id]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = card.width;
    const startHeight = card.height;

    // SAFETY: pointerdown targets are HTMLElements in the card DOM.
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

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 40 : 20;
    if (event.key === "ArrowRight") resizeCard(card.id, card.width + step, card.height);
    else if (event.key === "ArrowLeft") resizeCard(card.id, Math.max(MIN_CARD_WIDTH, card.width - step), card.height);
    else if (event.key === "ArrowDown") resizeCard(card.id, card.width, card.height + step);
    else if (event.key === "ArrowUp") resizeCard(card.id, card.width, Math.max(MIN_CARD_HEIGHT, card.height - step));
    else return;
    event.preventDefault();
  }

  return (
    <div
      className={`dt-canvas-card${isDragging ? " is-dragging" : ""}${isSelected ? " is-selected" : ""}${isFocused ? " is-focused" : ""}`}
      data-card-id={card.id}
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
      }}
      onPointerDown={handleCardPointerDown}
    >
      <div
        className="dt-canvas-card__toolbar"
        onPointerDown={handleToolbarPointerDown}
        style={{
          transform: `scale(${toolbarScale})`,
          transformOrigin: "right bottom",
        }}
      >
        <div className="dt-canvas-card__actions">
          <Button
            variant="secondary"
            size="default"
            data-test={`canvas-card-preview-${card.id}`}
            onClick={handleEdit}
          >
            <IconPlayerPlay size={14} stroke={1.8} aria-hidden="true" />
            Page view
          </Button>
          <IconButton
            label="Duplicate card"
            variant="secondary"
            size="default"
            data-test={`canvas-card-duplicate-${card.id}`}
            onClick={handleDuplicate}
          >
            <IconCopy size={14} stroke={1.8} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Reload card"
            variant="secondary"
            size="default"
            data-test={`canvas-card-reload-${card.id}`}
            onClick={handleReload}
          >
            <IconRefresh size={14} stroke={1.8} aria-hidden="true" />
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
              <Button size="compact" variant="secondary" onClick={handleReload}>Retry</Button>
              <Button size="compact" variant="danger" onClick={handleRemove}>Remove</Button>
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
        onKeyDown={handleResizeKeyDown}
        role="button"
        aria-label="Resize card"
        tabIndex={0}
      >
        <IconArrowsDiagonal size={12} aria-hidden="true" />
      </div>
    </div>
  );
}
