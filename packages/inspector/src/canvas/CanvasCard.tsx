import { useEffect, useRef, useState, type ReactElement } from "react";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";
import { removeCanvasCard, duplicateCard, updateCardTitle, updateCardUrl, type CanvasCard } from "./canvasStore.ts";
import { RefreshCw, Trash2, Pencil, Copy } from "lucide-react";
import { PROTOCOL_VERSION, type FrameReadyMessage, type FrameMetadataMessage, type FrameLoadError } from "./frameProtocol.ts";
import { registerCardFrame, unregisterCardFrame, sendProjectionToCard, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";

interface CanvasCardProps {
  card: CanvasCard;
  onEdit?: (card: CanvasCard) => void;
}

type CardLoadState = "loading" | "ready" | "error";

export function CanvasCard({ card, onEdit }: CanvasCardProps): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadState, setLoadState] = useState<CardLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <div className="dt-canvas-card" data-card-id={card.id}>
      <div className="dt-canvas-card__toolbar">
        <span className="dt-canvas-card__title" title={card.url}>
          {card.title || card.url}
        </span>
        <div className="dt-canvas-card__actions">
          <button
            type="button"
            className="dt-canvas-card__action"
            aria-label="Duplicate card"
            data-test={`canvas-card-duplicate-${card.id}`}
            onClick={handleDuplicate}
          >
            <Copy size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dt-canvas-card__action"
            aria-label="Edit this route"
            data-test={`canvas-card-edit-${card.id}`}
            onClick={handleEdit}
          >
            <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dt-canvas-card__action"
            aria-label="Reload card"
            data-test={`canvas-card-reload-${card.id}`}
            onClick={handleReload}
          >
            <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dt-canvas-card__action dt-canvas-card__action--danger"
            aria-label="Remove card"
            data-test={`canvas-card-remove-${card.id}`}
            onClick={handleRemove}
          >
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
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
    </div>
  );
}
