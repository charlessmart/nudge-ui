import { getCanonicalFrameProjection } from "./projection.ts";
import { getDraftForCard } from "../drafts/store.ts";
import { RoutePicker, ROUTE_PICKER_STYLES } from "./RoutePicker.tsx";
import { studyArtifactId, contentSourceUrl } from "./frameContent.ts";
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
  batchCanvasChanges,
  getBoardCamera,
  fitAllCards,
  focusCanvasCards,
  setCanvasPresentation,
  focusCard,
  hasFitAllRan,
  useBoardCamera,
  useCanvasPresentation,
  useCanvasPresentationTransitioning,
  useCanvasLayoutTransitioning,
  useTemporaryAppInteraction,
  setTemporaryAppInteraction,
  useSelectedCardId,
  useFocusedCardId,
  resizeCard,
  setCardPosition,
  updateCardTitle,
  addCanvasCard,
  selectCard,
  CARD_GAP,
  type CanvasCard as CanvasCardData,
  updateCardUrl,
} from "./canvasStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { CanvasFrameSection } from "./CanvasFrameSection.tsx";
import { useCanvasLayoutAnimation } from "./useCanvasLayoutAnimation.ts";
import { Button } from "../ui/Button.tsx";
import { useCanvasMode } from "./canvasStore.ts";
import { subscribeChanges } from "../changes/changesLog.ts";
import { subscribeOriginalPreview, isOriginalPreviewActive } from "../shell/originalPreview.ts";
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
import { normalizeUrl, normalizedUrlKey } from "./normalizeUrl.ts";
import { createNudgeUiEditorUrl } from "../../transport/editor.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import {
  PROTOCOL_VERSION,
  isProjectionAppliedMessage,
  isKeyboardShortcutMessage,
  isRenderedInstanceProjectionReportMessage,
  isTextProjectionReportMessage,
  isStructuralProjectionReportMessage,
} from "./frameProtocol.ts";
import { wheelPanDelta } from "./wheelPan.ts";
import { iframePointToClientPoint, zoomCameraAtPointer } from "./canvasGestures.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import foundationStyles from "../ui/Foundation.css?inline";
import { useInspectorOpen } from "../shell/openStore.ts";
import { isEditableEvent } from "../shell/shortcuts.ts";
import { acknowledgeAgentRendererReady } from "./agentPresentation.ts";
import { useInspectorSession } from "../session/sessionContext.tsx";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import {
  adjacentCanvasZoomLevel,
  CanvasToolbar,
  type CanvasInteractionTool,
} from "./CanvasToolbar.tsx";
import { canvasToolForEvent, canvasToolForCode } from "./keyboardShortcuts.ts";
import canvasToolbarStyles from "./CanvasToolbar.css?inline";
import { getActiveCanvasFrame } from "./activeCanvasDocument.ts";
import { startSketchCapture } from "../sketch/SketchWorkspace.tsx";
import { cancelSketchInteraction, useSketchInteractionActive } from "../sketch/interaction.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { DESIGN_SELECT_CURSOR, PAN_CURSOR, type RendererCursor } from "../ui/customCursors.ts";
import { removeCardDraft } from "../drafts/store.ts";
import { addLinkedFrame, createVariation as createWorkspaceVariation } from "../workspace/commands.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";

const WORKSPACE_STYLES = [foundationStyles, canvasWorkspaceStyles, canvasCardStyles, canvasToolbarStyles].join("\n");
const PRESENTATION_TRANSITION_MS = 200;

interface RectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export interface CanvasWorkspaceProps {
  readonly primaryUrl: string | null;
}

/** Static studies are independent even when they retain their source page URL. */
function isLinkedToActiveCard(card: CanvasCardData, cards: readonly CanvasCardData[], activeId: string | null): boolean {
  const active = cards.find((candidate) => candidate.id === activeId);
  if (!active || active.id === card.id || studyArtifactId(active.content) || studyArtifactId(card.content)) return false;
  const route = normalizeUrl(contentSourceUrl(card.content));
  const activeRoute = normalizeUrl(contentSourceUrl(active.content));
  return !!route && !!activeRoute && normalizedUrlKey(route) === normalizedUrlKey(activeRoute);
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
  const sketchActive = useSketchInteractionActive();
  const sketchEnabled = isNudgeUiDev() && runtimeConfig.demo !== true;
  const sketchAvailable = sketchEnabled && getActiveCanvasFrame() !== null;

  const boardRef = useRef<HTMLDivElement>(null);
  useCanvasLayoutAnimation(boardRef, cards, camera, presentation);
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAtPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const framePanContextRef = useRef<{ left: number; top: number; zoom: number } | null>(null);
  const spaceHeldRef = useRef(false);
  const fitAllScheduledRef = useRef(false);
  const activatedTargetRef = useRef<string | null>(null);
  const demoSeededRef = useRef(false);
  const previousPresentationRef = useRef(presentation);
  const focusCardRectRef = useRef<RectSnapshot | null>(null);
  const canvasEntryAnimationRef = useRef<Animation | null>(null);

  const [boardCursorClass, setBoardCursorClass] = useState("");
  const [selectedTool, setInteractionTool] = useState<CanvasInteractionTool>("design");
  const temporaryAppInteraction = useTemporaryAppInteraction();
  const interactionTool = temporaryAppInteraction ? "select" : selectedTool;
  const layoutTransitioning = useCanvasLayoutTransitioning();
  const rendererInteractionsEnabled = interactionTool !== "select" && !layoutTransitioning;
  const rendererCursor: RendererCursor = interactionTool === "pan" ? "drag" : "design";
  const boardCursor = boardCursorClass === "is-grabbing"
    ? "grabbing"
    : interactionTool === "pan" || boardCursorClass !== ""
      ? PAN_CURSOR
    : interactionTool === "design"
      ? DESIGN_SELECT_CURSOR
      : undefined;
  const linksOpenInCards = interactionTool === "select" && presentation === "canvas";
  const presentationCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id ?? null;

  useLayoutEffect(() => {
    const board = boardRef.current;
    const cardElement = presentationCardId
      ? board?.querySelector<HTMLElement>(`[data-card-id="${presentationCardId}"]`)
      : null;
    const boardContent = board?.querySelector<HTMLElement>('[data-test="canvas-board-content"]');

    if (presentation === "focus") {
      canvasEntryAnimationRef.current?.cancel();
      canvasEntryAnimationRef.current = null;
      if (boardContent) boardContent.style.transition = "";
      if (cardElement) cardElement.style.transition = "";
      focusCardRectRef.current = cardElement ? snapshotRect(cardElement.getBoundingClientRect()) : null;
    } else if (
      presentation === "canvas"
      && previousPresentationRef.current === "focus"
      && presentationTransitioning
      && cardElement
      && boardContent
      && focusCardRectRef.current
      && typeof cardElement.animate === "function"
    ) {
      // Commit the final layout before measuring it. The old implementation
      // transitioned both the camera and the card's position, which made the
      // nested scale and translation produce a sideways drift.
      boardContent.style.transition = "none";
      cardElement.style.transition = "none";
      const oldRect = focusCardRectRef.current;
      const newRect = snapshotRect(cardElement.getBoundingClientRect());
      if (newRect.width > 0 && newRect.height > 0 && camera.zoom > 0) {
        const oldCenterX = oldRect.left + oldRect.width / 2;
        const oldCenterY = oldRect.top + oldRect.height / 2;
        const newCenterX = newRect.left + newRect.width / 2;
        const newCenterY = newRect.top + newRect.height / 2;
        const localTranslateX = (oldCenterX - newCenterX) / camera.zoom;
        const localTranslateY = (oldCenterY - newCenterY) / camera.zoom;
        const scaleX = oldRect.width / newRect.width;
        const scaleY = oldRect.height / newRect.height;
        const animation = cardElement.animate(
          [
            {
              transformOrigin: "center center",
              transform: `translate(${localTranslateX}px, ${localTranslateY}px) scale(${scaleX}, ${scaleY})`,
            },
            { transformOrigin: "center center", transform: "none" },
          ],
          { duration: PRESENTATION_TRANSITION_MS, easing: "ease", fill: "both" },
        );
        canvasEntryAnimationRef.current = animation;
        void animation.finished.then(() => {
          if (canvasEntryAnimationRef.current !== animation) return;
          canvasEntryAnimationRef.current = null;
          animation.cancel();
          boardContent.style.transition = "";
          cardElement.style.transition = "";
        }).catch(() => {
          if (canvasEntryAnimationRef.current !== animation) return;
          canvasEntryAnimationRef.current = null;
          boardContent.style.transition = "";
          cardElement.style.transition = "";
        });
      } else {
        boardContent.style.transition = "";
        cardElement.style.transition = "";
      }
    }

    previousPresentationRef.current = presentation;
  }, [camera.zoom, presentation, presentationCardId, presentationTransitioning]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!primaryUrl || !board) return;
    if (activatedTargetRef.current === primaryUrl && cards.length > 0) return;
    activatedTargetRef.current = primaryUrl;
    const viewport = {
      width: board.clientWidth,
      height: board.clientHeight,
    };
    const primaryCard = activateIframeWorkspace(primaryUrl, viewport, {
      replaceActiveCard: presentation === "focus" && runtimeConfig.demo !== true,
      preserveStudyFocus: true,
    });
    if (primaryCard && cards.length === 0 && runtimeConfig.demo !== true) {
      setBoardCamera({
        x: 40, y: 120,
        zoom: Math.max(0.25, Math.min(0.9, (viewport.width - 80) / primaryCard.width, (viewport.height - 160) / primaryCard.height)),
      });
    }
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
        // Read each card's final width so restored or resized cards cannot overlap.
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
  }, [primaryUrl, cards.length, presentation, runtimeConfig.demo, runtimeConfig.demoPages, runtimeConfig.demoCardLabels]);

  useEffect(() => {
    if (primaryUrl && activatedTargetRef.current !== primaryUrl) return;
    const activeCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id;
    const activeCard = cards.find((card) => card.id === activeCardId);
    if (!activeCard) return;
    const editorUrl = createNudgeUiEditorUrl(contentSourceUrl(activeCard.content));
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
      cursor: spaceHeld ? "drag" : "design",
    }, window.location.origin);
  }, []);

  const sendInspectorInteractionState = useCallback((
    iframe: HTMLIFrameElement,
    cardId: string,
    open: boolean,
    interactionsEnabled: boolean,
    cursor: RendererCursor,
  ) => {
    iframe.contentWindow?.postMessage({
      type: "inspector-interaction-state",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      open,
      interactionsEnabled,
      cursor,
    }, window.location.origin);
  }, []);

  const sendLinkTargetState = useCallback((iframe: HTMLIFrameElement, cardId: string, openInCard: boolean) => {
    iframe.contentWindow?.postMessage({
      type: "link-target-state",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      openInCard,
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
      panScroll: enabled && interactionTool !== "select",
    }, window.location.origin);
  }, [interactionTool]);

  useEffect(() => {
    for (const [cardId, iframe] of getRegisteredFrames()) {
      sendInspectorInteractionState(iframe, cardId, inspectorOpen, rendererInteractionsEnabled, rendererCursor);
      sendBoardGestureState(iframe, cardId, presentation === "canvas");
      sendLinkTargetState(iframe, cardId, linksOpenInCards);
    }
  }, [inspectorOpen, linksOpenInCards, presentation, rendererCursor, rendererInteractionsEnabled, sendBoardGestureState, sendInspectorInteractionState, sendLinkTargetState]);

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

  const panCanvasByWheel = useCallback((deltaX: number, deltaY: number) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const camera = getBoardCamera();
    setBoardCamera({ ...camera, x: camera.x - deltaX, y: camera.y - deltaY });
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

  const stopPanMode = useCallback(() => {
    spaceHeldRef.current = false;
    broadcastPanModifier(false);
    endPanning();
    setBoardCursorClass("");
  }, [broadcastPanModifier, endPanning]);

  const handleToolChange = useCallback((nextTool: CanvasInteractionTool) => {
    if (nextTool === "select" && selectedTool === "select") {
      setInteractionTool("design");
      stopPanMode();
      return;
    }
    if (nextTool === "select") {
      setSelectedElement(null);
    }

    if (nextTool === "sketch") {
      if (!sketchEnabled) return;
      const hostElement = getActiveCanvasFrame();
      if (!hostElement) return;
      stopPanMode();
      setInteractionTool(nextTool);
      startSketchCapture(hostElement);
      return;
    }

    if (sketchActive) cancelSketchInteraction();

    if (nextTool === "pan") {
      if (presentation === "focus") {
        setCanvasPresentation("canvas");
      }
      setInteractionTool(nextTool);
      spaceHeldRef.current = true;
      broadcastPanModifier(true);
      if (!panningRef.current) setBoardCursorClass("is-grabbable");
      return;
    }

    setInteractionTool(nextTool);
    stopPanMode();
  }, [broadcastPanModifier, presentation, sketchActive, sketchEnabled, stopPanMode, selectedTool]);

  useEffect(() => {
    if (temporaryAppInteraction) stopPanMode();
    else if (selectedTool === "pan") {
      spaceHeldRef.current = true;
      broadcastPanModifier(true);
      setBoardCursorClass("is-grabbable");
    }
  }, [temporaryAppInteraction, selectedTool, stopPanMode, broadcastPanModifier]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode === "canvas" && event.key === "Shift" && !event.repeat && !isEditableEvent(event)) setTemporaryAppInteraction(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setTemporaryAppInteraction(event.shiftKey);
    };
    const onBlur = () => {
      if (!document.hasFocus()) setTemporaryAppInteraction(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setTemporaryAppInteraction(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      setTemporaryAppInteraction(false);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "canvas") return;
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableEvent(event)) return;
      const nextTool = canvasToolForEvent(event);
      if (!nextTool || (nextTool === "sketch" && !sketchAvailable)) return;
      event.preventDefault();
      handleToolChange(nextTool);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleToolChange, mode, sketchAvailable]);

  const handleZoomStep = useCallback((direction: -1 | 1) => {
    if (presentation === "focus") {
      if (direction < 0) {
        batchCanvasChanges(() => {
          const board = boardRef.current;
          const cards = getCanvasCards();
          const activeId = getSelectedCardId() ?? getFocusedCardId();
          const card = cards.find((candidate) => candidate.id === activeId) ?? cards[0];
          if (board && card) {
            const zoom = 0.9;
            setBoardCamera({
              x: board.clientWidth / 2 - (card.x + card.width / 2) * zoom,
              y: board.clientHeight / 2 - (card.y + card.height / 2) * zoom,
              zoom,
            });
          }
          setCanvasPresentation("canvas");
        });
      }
      return;
    }
    const nextZoom = adjacentCanvasZoomLevel(getBoardCamera().zoom, direction);
    if (nextZoom === null) return;
    setBoardCamera({ ...getBoardCamera(), zoom: nextZoom });
  }, [presentation]);

  const showCanvas = useCallback(() => {
    handleZoomStep(-1);
  }, [handleZoomStep]);

  const showFocus = useCallback((cardId: string) => {
    focusCard(cardId);
    setCanvasPresentation("focus");
  }, []);

  const duplicateDesign = useCallback((cardId: string) => {
    const duplicate = addLinkedFrame(cardId);
    if (!duplicate) return;
    setSelectedElement(null);
    setCanvasPresentation("canvas");
    const board = boardRef.current;
    focusCanvasCards([duplicate.id], board ? { width: board.clientWidth, height: board.clientHeight } : undefined);
  }, []);

  const createVariation = useCallback(async (cardId: string, position?: { x: number; y: number }) => {
    const variation = await createWorkspaceVariation(cardId, position);
    setSelectedElement(null);
    const board = boardRef.current;
    if (board && !position) focusCanvasCards([variation.id], { width: board.clientWidth, height: board.clientHeight });
    return variation.id;
  }, []);

  useEffect(() => {
    if (!sketchActive && interactionTool === "sketch") {
      setInteractionTool("design");
    }
  }, [interactionTool, sketchActive]);

  useLayoutEffect(() => {
    if (presentation !== "focus") return;
    endPanning();
    spaceHeldRef.current = false;
    setBoardCursorClass("");
    broadcastPanModifier(false);
  }, [broadcastPanModifier, endPanning, presentation]);

  useEffect(() => {
    const stopChanges = subscribeChanges(() => {
      projectToAllReadyCards();
    });
    const stopPreview = subscribeOriginalPreview(() => {
      projectToAllReadyCards();
    });
    return () => {
      stopChanges();
      stopPreview();
    };
  }, []);

  useEffect(() => {
    return subscribeCanvasRendererMessages(({ cardId, iframe, identity, message: msg }) => {
      if (msg.type === "renderer-hello") return;
      if (msg.type === "app-interaction-modifier") {
        if (mode === "canvas") setTemporaryAppInteraction(msg.held === true);
        return;
      }
      if (isKeyboardShortcutMessage(msg, identity)) {
        if (msg.phase === "keydown") {
          const nextTool = canvasToolForCode(msg.code);
          if (nextTool && (nextTool !== "sketch" || sketchAvailable)) handleToolChange(nextTool);
        }
        return;
      }
      const frame = { cardId, iframe };
      const syncActiveFrameUrl = (url: string): void => {
        if (getCanvasCards().some((card) => card.id === frame.cardId && studyArtifactId(card.content))) return;
        const activeCardId = getSelectedCardId() ?? getFocusedCardId() ?? getCanvasCards()[0]?.id;
        if (activeCardId === frame.cardId || getCanvasCards().length === 1) {
          activatedTargetRef.current = url;
          window.history.replaceState(window.history.state, "", createNudgeUiEditorUrl(url));
        }
        updateCardUrl(frame.cardId, url);
      };
      if (isProjectionAppliedMessage(msg, identity)) {
        recordCanvasProjectionApplied(frame.cardId, msg.revision);
        // While hold-to-view-original is active the frame intentionally shows
        // the page without inspector changes; skip conflict verification.
        if (isOriginalPreviewActive()) return;
        const frameDocument = frame.iframe.contentDocument;
        const plan = getCanonicalFrameProjection(frame.cardId, msg.revision);
        const draft = getDraftForCard(frame.cardId);
        if (frameDocument && plan && draft && isCanvasCanonicalProjectionRevisionCurrent(frameDocument, msg.revision)) {
          const attempt = beginPreviewAttempt(
            getCanvasPreviewDocument(frame.cardId),
            plan.draftRevision,
          );
          if (attempt) {
            for (const change of draft.contents.changes) {
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
        const plan = getCanonicalFrameProjection(frame.cardId, msg.revision);
        if (plan) recordCanvasStructuralProjectionReports(frame.cardId, msg.revision, msg.reports, plan);
        return;
      }
      if (isRenderedInstanceProjectionReportMessage(msg, identity)) {
        const plan = getCanonicalFrameProjection(frame.cardId, msg.revision);
        if (plan) recordCanvasRenderedInstanceProjectionReports(frame.cardId, msg.revision, msg.reports, plan);
        return;
      }
      if (isTextProjectionReportMessage(msg, identity)) {
        const plan = getCanonicalFrameProjection(frame.cardId, msg.revision);
        if (plan) recordCanvasTextProjectionReports(frame.cardId, msg.revision, msg.reports, plan);
        return;
      }
      if (msg.type === "frame-ready") {
        acknowledgeAgentRendererReady(frame.cardId);
        syncActiveFrameUrl(msg.url);
        // A card can finish loading after Space was pressed on the controller.
        // Seed it with the current modifier state before its first pointer event.
        sendPanModifier(frame.iframe, frame.cardId, spaceHeldRef.current);
        sendInspectorInteractionState(
          frame.iframe,
          frame.cardId,
          inspectorOpen,
          rendererInteractionsEnabled,
          spaceHeldRef.current ? "drag" : rendererCursor,
        );
        sendBoardGestureState(frame.iframe, frame.cardId, presentation === "canvas");
        sendLinkTargetState(frame.iframe, frame.cardId, linksOpenInCards);
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
      if (msg.type === "wheel-pan") {
        if (presentation === "canvas" && interactionTool !== "select") panCanvasByWheel(msg.deltaX, msg.deltaY);
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
      if (getCanvasCards().some((card) => card.id === frame.cardId && studyArtifactId(card.content))) return;
      const normalized = normalizeUrl(msg.url);
      if (!normalized || normalized.origin !== window.location.origin) return;

      if (msg.openInCard === true && presentation === "canvas") {
        const card = getCanvasCards().find((candidate) => {
          const route = !studyArtifactId(candidate.content) && normalizeUrl(contentSourceUrl(candidate.content));
          return route && normalizedUrlKey(route) === normalizedUrlKey(normalized);
        }) ?? addCanvasCard(msg.url);
        selectCard(card.id);
        const board = boardRef.current;
        if (board) focusCanvasCards([card.id], { width: board.clientWidth, height: board.clientHeight });
        return;
      }
      if (msg.openInCard === true) {
        // A delayed renderer message must not create a new frame after entering focus mode.
        selectCard(frame.cardId);
        activateIframeWorkspace(msg.url, { width: boardRef.current?.clientWidth ?? window.innerWidth, height: boardRef.current?.clientHeight ?? window.innerHeight }, { replaceActiveCard: true });
        return;
      }
      const frameDocument = frame.iframe.contentDocument;
      if (frameDocument) disposeInlineTextEdit("route-disposed", frameDocument);
    });
  }, [broadcastPanModifier, endPanning, handleToolChange, interactionTool, mode, panCanvasByWheel, inspectorOpen, linksOpenInCards, movePanning, presentation, rendererCursor, rendererInteractionsEnabled, sendBoardGestureState, sendInspectorInteractionState, sendLinkTargetState, sendPanModifier, sketchAvailable, startPanning, zoomAtPointer]);

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
      if (mode !== "canvas" || presentation !== "canvas" || sketchActive || interactionTool === "select") return;
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditableEvent(e)) {
        const selectedCardId = getSelectedCardId();
        if (!selectedCardId) return;
        e.preventDefault();
        removeCanvasCard(selectedCardId);
        removeCardDraft(selectedCardId);
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        if (isEditableEvent(e)) return;
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
        spaceHeldRef.current = interactionTool === "pan";
        broadcastPanModifier(spaceHeldRef.current);
        if (!panningRef.current) {
          setBoardCursorClass(spaceHeldRef.current ? "is-grabbable" : "");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [broadcastPanModifier, interactionTool, mode, presentation, sketchActive]);

  const handleBoardPointerDown = useCallback((e: React.PointerEvent) => {
    if (presentation !== "canvas" || sketchActive) return;
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
  }, [endPanning, movePanning, presentation, sketchActive, startPanning]);

  useEffect(() => {
    if (mode !== "canvas" || presentation !== "canvas") return;

    function handleGlobalWheel(e: WheelEvent): void {
      const zoom = e.ctrlKey || e.metaKey;
      const board = boardRef.current;
      if (zoom && sketchActive) return;
      if (!zoom && (interactionTool === "select" || !board || !e.composedPath().includes(board))) return;
      e.preventDefault();
      e.stopPropagation();
      if (zoom) zoomAtPointer({ x: e.clientX, y: e.clientY }, e.deltaY);
      else if (board) {
        const delta = wheelPanDelta(e, { width: board.clientWidth, height: board.clientHeight });
        panCanvasByWheel(delta.x, delta.y);
      }
    }

    window.addEventListener("wheel", handleGlobalWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", handleGlobalWheel, { capture: true });
  }, [mode, presentation, sketchActive, interactionTool, panCanvasByWheel, zoomAtPointer]);

  const renderCard = (card: CanvasCardData) => (
    <CanvasCard
      key={card.id}
      card={card}
      presentation={presentation}
      presentationCard={card.id === presentationCardId}
      linkedToActive={isLinkedToActiveCard(card, cards, selectedCardId ?? focusedCardId)}
      onShowFocus={showFocus}
      onDuplicate={duplicateDesign}
      onCreateVariation={createVariation}
      documentOwner={inspectorSession}
    />
  );

  if (mode !== "canvas") return null;

  return (
    <>
      <style data-test="canvas-styles">{WORKSPACE_STYLES + ROUTE_PICKER_STYLES}</style>
      <div
        className={`canvas-workspace${presentationTransitioning ? " is-presentation-transitioning" : ""}`}
        data-test="canvas-workspace"
        data-presentation={presentation}
        style={{ right: inspectorOpen ? "min(320px, 100vw)" : 0 }}
      >
        <div
          className={`canvas-workspace__board ${boardCursorClass}${layoutTransitioning ? " is-layout-transitioning" : ""}`.trim()}
          data-test="canvas-board"
          ref={boardRef}
          style={{ cursor: boardCursor }}
          onPointerDown={handleBoardPointerDown}
        >
          <RoutePicker viewport={() => ({ width: boardRef.current?.clientWidth ?? window.innerWidth, height: boardRef.current?.clientHeight ?? window.innerHeight })} />
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
            {[...new Set(cards.map((card) => card.groupId ?? card.id))].map((id) => {
              const members = cards.filter((card) => (card.groupId ?? card.id) === id);
              return <CanvasFrameSection key={id} id={id} cards={members} zoom={camera.zoom} presentation={presentation}>
                {members.map(renderCard)}
              </CanvasFrameSection>;
            })}
          </div>
          {!sketchActive ? (
            <CanvasToolbar
              tool={interactionTool}
              sketchEnabled={sketchAvailable}
              onToolChange={handleToolChange}
            />
          ) : null}
        </div>
      </div>
      {sketchActive ? (
        <div
          className="canvas-toolbar__portal"
          data-test="canvas-toolbar-portal"
          style={{ right: inspectorOpen ? "min(320px, 100vw)" : 0 }}
        >
          <CanvasToolbar
            tool={interactionTool}
            sketchEnabled={sketchAvailable}
            onToolChange={handleToolChange}
          />
        </div>
      ) : null}
    </>
  );
}
