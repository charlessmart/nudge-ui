import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";
import { removeCanvasCard, updateCardTitle, updateCardUrl, resizeCard, setCardPosition, selectCard, getSelectedCardId, useSelectedCardId, useFocusedCardId, useBoardCamera, type CanvasCard, type CanvasPresentation } from "./canvasStore.ts";
import { IconArrowsDiagonal, IconCornerLeftDown, IconExternalLink } from "@tabler/icons-react";
import {
  PROTOCOL_VERSION,
} from "./frameProtocol.ts";
import { registerCardFrame, registerCardFrameSource, unregisterCardFrame, sendProjectionToCard, invalidateCanvasPreviewDocument, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
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

interface CanvasCardProps {
  card: CanvasCard;
  presentation?: CanvasPresentation;
  presentationCard?: boolean;
  onOpenApp?: (card: CanvasCard) => void;
  onShowFocus?: (cardId: string) => void;
  documentOwner?: InspectorSession;
}

type CardLoadState = "loading" | "ready" | "error";

const MIN_CARD_WIDTH = 200;
const MIN_CARD_HEIGHT = 150;

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
              onClick={() => onOpenApp(card)}
            >
              <IconExternalLink size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
              Open app
            </Button>
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
      {presentation === "canvas" ? <div
        className="canvas-card__resize-handle"
        data-test={`canvas-card-resize-${card.id}`}
        style={{
          transform: `scale(${resizeHandleScale})`,
          transformOrigin: "right bottom",
        }}
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        role="button"
        aria-label="Resize card"
        tabIndex={0}
      >
        <IconArrowsDiagonal size={12} aria-hidden="true" />
      </div> : null}
    </div>
  );
}
