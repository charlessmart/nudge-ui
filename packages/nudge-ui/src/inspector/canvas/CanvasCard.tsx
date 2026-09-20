import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";
import { removeCanvasCard, duplicateCard, updateCardTitle, updateCardUrl, resizeCard, setCardPosition, selectCard, getSelectedCardId, useSelectedCardId, useFocusedCardId, useBoardCamera, type CanvasCard, type CanvasPresentation } from "./canvasStore.ts";
import { IconRefresh, IconExternalLink, IconCopy, IconArrowsDiagonal, IconCornerLeftDown } from "@tabler/icons-react";
import {
  PROTOCOL_VERSION,
} from "./frameProtocol.ts";
import { registerCardFrame, registerCardFrameSource, unregisterCardFrame, sendProjectionToCard, invalidateCanvasPreviewDocument, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { Button } from "../ui/Button.tsx";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { clearCanvasStructuralProjectionReports } from "../projection/structuralProjection.ts";
import { clearCanvasRenderedInstanceProjectionReports } from "../projection/renderedInstance.ts";
import { clearCanvasTextProjectionReports } from "../projection/textProjection.ts";
import { getCanvasToolbarScale } from "./toolbarScale.ts";
import { getCanvasResizeHandleScale } from "./resizeHandleScale.ts";
import type { DocumentSession, InspectorSession } from "../session/sessionFactory.ts";
import { disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { releaseDocumentProjection } from "../projection/structuralProjection.ts";
import { startClipboardHandoffController } from "../prompt/clipboardHandoff.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig, type NudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { reconcileRuntimeWithDocumentStylesheets } from "../runtime/documentStylesheetOrder.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import { SketchFrameOverlay } from "../sketch/SketchFrameOverlay.tsx";
import {
  getCanvasResizeEdges,
  resizeCanvasRect,
  type CanvasResizeDirection,
} from "./canvasResize.ts";

interface CanvasCardProps {
  card: CanvasCard;
  presentation?: CanvasPresentation;
  presentationCard?: boolean;
  onOpenApp?: (card: CanvasCard) => void;
  onShowFocus?: (cardId: string) => void;
  documentOwner?: InspectorSession;
}

type CardLoadState = "loading" | "ready" | "error";

interface CanvasResizeHandleDefinition {
  readonly direction: CanvasResizeDirection;
  readonly cursor: string;
  readonly transformOrigin: string;
  readonly label: string;
}

const RESIZE_HANDLES: readonly CanvasResizeHandleDefinition[] = [
  { direction: "top-left", cursor: "nwse-resize", transformOrigin: "left top", label: "Resize card from the top-left corner" },
  { direction: "top", cursor: "ns-resize", transformOrigin: "center top", label: "Resize card from the top edge" },
  { direction: "top-right", cursor: "nesw-resize", transformOrigin: "right top", label: "Resize card from the top-right corner" },
  { direction: "right", cursor: "ew-resize", transformOrigin: "right center", label: "Resize card from the right edge" },
  { direction: "bottom-right", cursor: "nwse-resize", transformOrigin: "right bottom", label: "Resize card from the bottom-right corner" },
  { direction: "bottom", cursor: "ns-resize", transformOrigin: "center bottom", label: "Resize card from the bottom edge" },
  { direction: "bottom-left", cursor: "nesw-resize", transformOrigin: "left bottom", label: "Resize card from the bottom-left corner" },
  { direction: "left", cursor: "ew-resize", transformOrigin: "left center", label: "Resize card from the left edge" },
];

function resizeHandleTransform(direction: CanvasResizeDirection, scale: number): string {
  if (direction === "top" || direction === "bottom") return `scale(1, ${scale})`;
  if (direction === "left" || direction === "right") return `scale(${scale}, 1)`;
  return `scale(${scale})`;
}

export function CanvasCard({ card, presentation = "canvas", presentationCard = true, onOpenApp, onShowFocus, documentOwner }: CanvasCardProps): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialUrlRef = useRef(card.navigationUrl ?? card.url);
  const navigationUrlRef = useRef(card.navigationUrl);
  const documentSessionRef = useRef<{ document: Document; session: DocumentSession } | null>(null);
  const frameRuntimeRef = useRef<NudgeUiRuntimeConfig | null>(null);
  const [loadState, setLoadState] = useState<CardLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const camera = useBoardCamera();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const isSelected = selectedCardId === card.id;
  const isFocused = focusedCardId === card.id;
  const isFocusPresentationCard = presentation === "focus" && presentationCard;
  const toolbarScale = getCanvasToolbarScale(camera.zoom);
  const resizeHandleScale = getCanvasResizeHandleScale(camera.zoom);

  const disposeDocumentSession = useCallback((): void => {
    documentSessionRef.current?.session.dispose();
    documentSessionRef.current = null;
  }, []);

  const loadFrame = useCallback((url?: string): void => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (getSelectedCardId() === card.id) setSelectedElement(null);
    disposeDocumentSession();
    invalidateCanvasPreviewDocument(card.id);
    setLoadState("loading");
    setErrorMessage(null);
    iframe.setAttribute("src", url ?? iframe.src);
  }, [card.id, disposeDocumentSession]);

  const bindDocumentSession = useCallback((): void => {
    const frameDocument = iframeRef.current?.contentDocument;
    if (!documentOwner || !frameDocument) return;
    if (documentSessionRef.current?.document === frameDocument) return;
    disposeDocumentSession();
    const session = documentOwner.createDocumentSession(frameDocument);
    session.registerCleanup(() => disposeBrowserCssInspection(frameDocument));
    session.registerCleanup(() => releaseDocumentProjection(frameDocument));
    session.registerCleanup(() => disposeInlineTextEdit("frame-disposed", frameDocument));
    session.registerCleanup(startClipboardHandoffController(frameDocument));
    documentSessionRef.current = { document: frameDocument, session };
  }, [disposeDocumentSession, documentOwner]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    registerCardFrameSource(card.id, iframe);
    bindDocumentSession();
    return () => {
      disposeDocumentSession();
      unregisterCardFrame(card.id);
    };
  }, [bindDocumentSession, card.id, disposeDocumentSession]);

  function handleReload(): void {
    loadFrame();
  }

  function handleRemove(): void {
    if (getSelectedCardId() === card.id) setSelectedElement(null);
    removeCanvasCard(card.id);
  }

  function updateFrameTitle(title: string | undefined): void {
    if (!title) return;
    const runtime = getNudgeUiRuntimeConfig();
    if (runtime.demo === true && (runtime.demoCardLabels?.length ?? 0) > 0) return;
    updateCardTitle(card.id, title);
  }

  function handleOpenApp(): void {
    onOpenApp?.(card);
  }

  function handleDuplicate(): void {
    duplicateCard(card.id);
  }

  /** The controller half of the handshake: announce workspace identity. */
  function sendParentReady(): void {
    iframeRef.current?.contentWindow?.postMessage({
      type: "parent-ready",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId: card.id,
    }, window.location.origin);
  }

  function adoptFrameRuntime(runtime: NudgeUiRuntimeConfig): void {
    frameRuntimeRef.current = runtime;
    if (getSelectedCardId() !== card.id) return;
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameDocument) return;
    try {
      configureNudgeUiRuntime(runtime);
      const configured = getNudgeUiRuntimeConfig();
      const reconciled = reconcileRuntimeWithDocumentStylesheets(configured, frameDocument);
      if (reconciled !== configured) configureNudgeUiRuntime(reconciled);
    } catch {
      // Ignore malformed same-origin renderer metadata and keep the last valid runtime.
    }
  }

  useEffect(() => {
    if (!isSelected || !frameRuntimeRef.current) return;
    adoptFrameRuntime(frameRuntimeRef.current);
  }, [isSelected]);

  useEffect(() => {
    return subscribeCanvasRendererMessages(({ cardId, message: data }) => {
      if (cardId !== card.id) return;
      // A renderer whose runtime finished booting after the iframe load event
      // asks for the identity announcement it may have missed.
      if (data.type === "renderer-hello") {
        sendParentReady();
        return;
      }

      if (data.type === "frame-ready") {
        adoptFrameRuntime(data.runtime);
        setLoadState("ready");
        setErrorMessage(null);
        updateFrameTitle(data.title);
        if (data.url) updateCardUrl(card.id, data.url);
        if (iframeRef.current) {
          registerCardFrame(card.id, iframeRef.current);
          sendProjectionToCard(card, iframeRef.current);
        }
        return;
      }


      if (data.type === "frame-runtime") {
        adoptFrameRuntime(data.runtime);
        return;
      }

      if (data.type === "frame-metadata") {
        updateFrameTitle(data.title);
        if (data.url) updateCardUrl(card.id, data.url);
        return;
      }

      if (data.type === "frame-error") {
        setLoadState("error");
        setErrorMessage(data.message || "Frame failed to load");
      }
    });
  }, [card.id]);

  useLayoutEffect(() => {
    if (!card.navigationUrl || navigationUrlRef.current === card.navigationUrl) return;
    navigationUrlRef.current = card.navigationUrl;
    loadFrame(card.navigationUrl);
  }, [card.navigationUrl, loadFrame]);

  useEffect(() => {
    if (loadState !== "loading") return;
    const timeout = setTimeout(() => {
      setLoadState("error");
      setErrorMessage("Frame load timed out");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loadState]);
  // A late handshake still recovers: the message listener stays installed in
  // the error state, so a slow renderer's eventual frame-ready flips the card
  // back to "ready" without user action.

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    function onLoad(): void {
      if (getSelectedCardId() === card.id) setSelectedElement(null);
      disposeDocumentSession();
      // A reload creates a new renderer document; do not show diagnostics
      // produced by the old frame while its replacement is handshaking.
      invalidateCanvasPreviewDocument(card.id);
      clearCanvasStructuralProjectionReports(card.id);
      clearCanvasRenderedInstanceProjectionReports(card.id);
      clearCanvasTextProjectionReports(card.id);
      bindDocumentSession();
      sendParentReady();
    }
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [bindDocumentSession, card.id, disposeDocumentSession]);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, cardX: 0, cardY: 0 });
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => resizeCleanupRef.current?.();
  }, []);

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

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>, direction: CanvasResizeDirection) => {
    e.stopPropagation();
    e.preventDefault();

    resizeCleanupRef.current?.();

    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = {
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    };

    function onMove(ev: PointerEvent): void {
      if (ev.pointerId !== pointerId) return;
      const delta = {
        x: (ev.clientX - startX) / camera.zoom,
        y: (ev.clientY - startY) / camera.zoom,
      };
      const next = resizeCanvasRect(start, direction, delta);
      resizeCard(card.id, next.width, next.height, { x: next.x, y: next.y });
    }

    function cleanup(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      target.removeEventListener("lostpointercapture", onLostPointerCapture);
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null;
    }

    function onUp(ev: PointerEvent): void {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onCancel(ev: PointerEvent): void {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onLostPointerCapture(ev: PointerEvent): void {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    resizeCleanupRef.current = cleanup;
    // SAFETY: the resize handle is an HTMLDivElement in this DOM context.
    target.setPointerCapture?.(pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    target.addEventListener("lostpointercapture", onLostPointerCapture);
  }, [card, camera.zoom]);

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>, direction: CanvasResizeDirection): void {
    const isArrowKey = event.key === "ArrowRight"
      || event.key === "ArrowLeft"
      || event.key === "ArrowDown"
      || event.key === "ArrowUp";
    if (!isArrowKey) return;

    event.preventDefault();
    event.stopPropagation();

    const step = event.shiftKey ? 40 : 20;
    const delta = {
      x: event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
      y: event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
    };
    const edges = getCanvasResizeEdges(direction);
    if ((delta.x !== 0 && edges.horizontal === null) || (delta.y !== 0 && edges.vertical === null)) return;
    const next = resizeCanvasRect(card, direction, delta);
    resizeCard(card.id, next.width, next.height, { x: next.x, y: next.y });
  }

  return (
    <div
      className={`canvas-card${isDragging ? " is-dragging" : ""}${isSelected ? " is-selected" : ""}${isFocused ? " is-focused" : ""}${isFocusPresentationCard ? " is-focus-presentation" : ""}${presentationCard ? " is-presentation-card" : ""}`}
      data-card-id={card.id}
      style={{
        position: "absolute",
        visibility: presentation === "focus" && !presentationCard ? "hidden" : undefined,
        pointerEvents: presentation === "focus" && !presentationCard ? "none" : undefined,
        left: isFocusPresentationCard ? 0 : card.x,
        top: isFocusPresentationCard ? 0 : card.y,
        width: isFocusPresentationCard ? "100%" : card.width,
        height: isFocusPresentationCard ? "100%" : card.height,
      }}
      onPointerDown={presentation === "canvas" ? handleCardPointerDown : undefined}
    >
      {presentation === "canvas" ? <div
        className="canvas-card__toolbar"
        onPointerDown={handleToolbarPointerDown}
      >
        <div
          className="canvas-card__drag-surface"
          data-test={`canvas-card-drag-${card.id}`}
        >
          {onShowFocus ? (
            <Button
              title="Focus"
              variant="primary"
              size="default"
              data-test={`canvas-card-focus-${card.id}`}
              style={{
                transform: `scale(${toolbarScale})`,
                transformOrigin: "left bottom",
              }}
              onClick={() => onShowFocus(card.id)}
            >
              <IconCornerLeftDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
              Focus
            </Button>
          ) : null}
          <span
            className="canvas-card__dimensions"
            data-test={`canvas-card-dimensions-${card.id}`}
            style={{
              transform: `scale(${toolbarScale})`,
              transformOrigin: "left bottom",
            }}
          >
            {card.title || `${Math.round(card.width)} × ${Math.round(card.height)} px`}
          </span>
        </div>
        {onOpenApp ? (
          <div
            className="canvas-card__actions"
            style={{
              transform: `scale(${toolbarScale})`,
              transformOrigin: "right bottom",
            }}
          >
            <Button
              variant="secondary"
              size="default"
              data-test={`canvas-card-open-app-${card.id}`}
              onClick={handleOpenApp}
            >
              <IconExternalLink size={14} stroke={1.8} aria-hidden="true" />
              Open app
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
        ) : null}
      </div> : null}
      <div className="canvas-card__frame">
        {loadState === "loading" ? (
          <div className="canvas-card__loading" data-test={`canvas-card-loading-${card.id}`}>
            Loading preview...
          </div>
        ) : loadState === "error" ? (
          <div className="canvas-card__error" data-test={`canvas-card-error-${card.id}`}>
            <p>{errorMessage || "Frame could not be loaded"}</p>
            <div className="canvas-card__error-actions">
              <Button size="compact" variant="secondary" onClick={handleReload}>Retry</Button>
              <Button size="compact" variant="danger" onClick={handleRemove}>Remove</Button>
            </div>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          className="canvas-card__iframe"
          src={initialUrlRef.current}
          title={card.title || card.url}
          {...{ [CANVAS_RENDERER_ATTR]: "" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          data-test={`canvas-card-iframe-${card.id}`}
        />
        <SketchFrameOverlay iframe={iframeRef.current} cardUrl={card.url} ready={loadState === "ready"} />
      </div>
      {presentation === "canvas" ? RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.direction}
          className={`canvas-card__resize-handle canvas-card__resize-handle--${handle.direction}`}
          data-test={`canvas-card-resize-${card.id}${handle.direction === "bottom-right" ? "" : `-${handle.direction}`}`}
          data-resize-direction={handle.direction}
          style={{
            // Keep the edge's long axis aligned with the zoomed card. Only
            // the thickness needs inverse scaling to remain screen-sized.
            transform: resizeHandleTransform(handle.direction, resizeHandleScale),
            transformOrigin: handle.transformOrigin,
            cursor: handle.cursor,
          }}
          onPointerDown={(event) => handleResizeStart(event, handle.direction)}
          onKeyDown={(event) => handleResizeKeyDown(event, handle.direction)}
          role="button"
          aria-label={handle.direction === "bottom-right" ? "Resize card" : handle.label}
          tabIndex={0}
        >
          {handle.direction === "bottom-right" ? <IconArrowsDiagonal size={12} aria-hidden="true" /> : null}
        </div>
      )) : null}
    </div>
  );
}
