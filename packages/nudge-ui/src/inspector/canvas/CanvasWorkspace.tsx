import { getCanonicalFrameProjection } from "./projection.ts";
import { getDraftForCard } from "../drafts/store.ts";
import { iterationId, contentSourceUrl, getLinkedFrameIds } from "./frameContent.ts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { IconCornerLeftUp, IconExternalLink } from "@tabler/icons-react";
import {
  useCanvasCards,
  activateIframeWorkspace,
  getSelectedCardId,
  getFocusedCardId,
  getCanvasCards,
  batchCanvasChanges,
  fitAllCards,
  focusCanvasCards,
  focusCard,
  useSelectedCardId,
  useFocusedCardId,
  resizeCard,
  setCardPosition,
  updateCardTitle,
  addCanvasCard,
  selectCard,
  deselectCard,
  CARD_GAP,
  type CanvasCard as CanvasCardData,
  updateCardUrl,
} from "./canvasStore.ts";
import {
  setBoardCamera,
  getBoardCamera,
  setCanvasPresentation,
  hasFitAllRan,
  useBoardCamera,
  useCanvasPresentation,
  useCanvasPresentationTransitioning,
  useCanvasLayoutTransitioning,
  useTemporaryAppInteraction,
  setTemporaryAppInteraction,
  setAppToolActive,
} from "./viewStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { PageCard } from "./PageCard.tsx";
import { isPageSurface } from "./pageSurface.ts";
import { canvasFrameHost } from "./canvasFrame.ts";
import { useCanvasLayoutAnimation } from "./useCanvasLayoutAnimation.ts";
import { Button } from "../ui/Button.tsx";
import { useCanvasMode } from "./viewStore.ts";
import { getActiveDraftChanges, getChangesList, subscribeActiveDraftChanges } from "../drafts/store.ts";
import { subscribeOriginalPreview, isOriginalPreviewActive } from "../shell/originalPreview.ts";
import { recordCanvasStructuralProjectionReports } from "../projection/structuralProjection.ts";
import { recordCanvasRenderedInstanceProjectionReports } from "../projection/renderedInstance.ts";
import { recordCanvasTextProjectionReports } from "../projection/textProjection.ts";
import { beginPreviewAttempt } from "../changes/previewDiagnostics.ts";
import { verifyPreviewChanges } from "../changes/previewVerification.ts";
import {
  getCanvasPreviewDocument,
  isCanvasCanonicalProjectionRevisionCurrent,
  projectToAllReadyCards,
  recordCanvasProjectionApplied,
  getFrameRegistryVersion,
  subscribeFrameRegistry,
} from "./projection.ts";
import { connectFrame, toViewportPoint, toViewportRect, type FrameConnection, type FrameViewport } from "./frameConnection.ts";
import { LINK_POPOVER_HEIGHT, LINK_POPOVER_WIDTH, placeLinkPopover, type LinkPopoverAnchor } from "./linkPopoverPlacement.ts";
import { normalizeUrl, normalizedUrlKey } from "./normalizeUrl.ts";
import { createNudgeUiEditorUrl } from "../../transport/editor.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import {
  isDebugViewPhaseMessage,
  isProjectionAppliedMessage,
  isKeyboardShortcutMessage,
  isRenderedInstanceProjectionReportMessage,
  isTextProjectionReportMessage,
  isStructuralProjectionReportMessage,
} from "./frameProtocol.ts";
import { wheelPanDelta } from "./wheelPan.ts";
import { zoomCameraAtPointer } from "./canvasGestures.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";
import foundationStyles from "../ui/Foundation.css?inline";
import { useInspectorOpen } from "../shell/openStore.ts";
import { isEditableEvent } from "../shell/shortcuts.ts";
import { useInspectorSession } from "../session/sessionContext.tsx";
import { isNudgeUiFeatureEnabled } from "../runtime/runtimeConfig.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import {
  adjacentCanvasZoomLevel,
  CanvasToolbar,
  type CanvasInteractionTool,
} from "./CanvasToolbar.tsx";
import { APP_INTERACTION_KEY, canvasToolForEvent, canvasToolForCode, claimShortcutKey, inspectionViewForCode } from "./keyboardShortcuts.ts";
import { canvasToolEffects, type BoardPointerState } from "./toolEffects.ts";
import { getExplodeView, getOutlinesView, setAnimationSpeed, setExplodeView, setOutlinesView, useAnimationSpeed, useExplodeView, useOutlinesView, useSpacingView } from "./debugViewStore.ts";
import { MAX_ANIMATION_SPEED } from "./animationSpeed.ts";
import { rendererDesiredState, sendRendererState, sendRendererStateToAll } from "./rendererState.ts";
import { clearFramesExploded, setFrameExploded } from "./frameViewState.ts";
import { InspectionBar } from "./InspectionBar.tsx";
import canvasToolbarStyles from "./CanvasToolbar.css?inline";
import sketchToolBarStyles from "./sketch/SketchToolBar.css?inline";
import { getActiveCanvasFrame } from "./activeCanvasDocument.ts";
import { startSketch } from "./sketch/SketchWorkspace.tsx";
import { cancelSketchInteraction, useSketchInteractionActive } from "./sketch/interaction.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { createCommentCursor, DESIGN_SELECT_CURSOR, PAN_CURSOR } from "../ui/customCursors.ts";
import { addLinkedFrame, createIteration as createWorkspaceIteration, removeFrame } from "../workspace/commands.ts";
import { getSelectedElements, setSelectedElement } from "../selection/selectionStore.ts";

import { setCommentToolActive } from "../comments/store.ts";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";

const WORKSPACE_STYLES = [foundationStyles, canvasWorkspaceStyles, canvasCardStyles, canvasToolbarStyles, sketchToolBarStyles].join("\n");
const PRESENTATION_TRANSITION_MS = 200;
/** A strong in-out curve: the card morphs on screen rather than entering or leaving. */
const PRESENTATION_TRANSITION_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";
/** Leaves the open panel's reserved space uncovered; see the placement variables in `InspectorShell.css`. */
const PANEL_RESERVED_INSET = { left: "var(--panel-reserve-start)", right: "var(--panel-reserve-end)" } as const;

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

/** A link under the pointer inside one canvas frame, in renderer viewport coordinates. */
interface LinkPreviewState {
  readonly frame: FrameConnection;
  readonly url: string;
  readonly rect: RectSnapshot;
  /** Where the pointer entered the link, in renderer viewport coordinates. */
  readonly point: { readonly x: number; readonly y: number } | null;
}

export interface CanvasWorkspaceProps {
  readonly primaryUrl: string | null;
}

export function CanvasWorkspace({ primaryUrl }: CanvasWorkspaceProps): ReactElement | null {
  const mode = useCanvasMode();
  const pageSurface = isPageSurface();
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
  const sketchEnabled = isNudgeUiDev()
    && (runtimeConfig.demo !== true || isNudgeUiFeatureEnabled(runtimeConfig.features, "sketch"));
  const canvasIterationsEnabled = isNudgeUiFeatureEnabled(runtimeConfig.features, "canvasIterations");
  useSyncExternalStore(subscribeFrameRegistry, getFrameRegistryVersion);
  const sketchAvailable = sketchEnabled && getActiveCanvasFrame() !== null;

  const boardRef = useRef<HTMLDivElement>(null);
  useCanvasLayoutAnimation(boardRef, cards, camera, presentation);
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAtPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const framePanContextRef = useRef<FrameViewport | null>(null);
  const spaceHeldRef = useRef(false);
  // Mirrored into state so the desired renderer state can carry it; the ref stays for synchronous event handlers.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const updateSpaceHeld = useCallback((held: boolean): void => {
    spaceHeldRef.current = held;
    setSpaceHeld(held);
  }, []);
  const fitAllScheduledRef = useRef(false);
  // Track the consumed primaryUrl prop separately from navigation inside a frame.
  const activatedPrimaryUrlRef = useRef<string | null>(null);
  const demoSeededRef = useRef(false);
  const previousPresentationRef = useRef(presentation);
  const presentationAnimationRef = useRef<Animation | null>(null);

  const [boardCursorClass, setBoardCursorClass] = useState("");
  const [selectedTool, setInteractionTool] = useState<CanvasInteractionTool>(runtimeConfig.demo === true ? "select" : "design");
  const temporaryAppInteraction = useTemporaryAppInteraction();
  const layoutTransitioning = useCanvasLayoutTransitioning();
  const outlinesView = useOutlinesView();
  const explodeView = useExplodeView();
  const spacingView = useSpacingView();
  const animationSpeed = useAnimationSpeed();
  const pointerState: BoardPointerState = boardCursorClass === "is-grabbing"
    ? "grabbing"
    : boardCursorClass !== "" ? "grabbable" : "idle";
  const toolEffects = useMemo(
    () => canvasToolEffects({
      tool: selectedTool,
      outlines: outlinesView,
      explode: explodeView,
      spacing: spacingView,
      animationSpeed,
      presentation,
      layoutTransitioning,
      sketchActive,
      temporaryAppInteraction,
      pointer: pointerState,
    }),
    [animationSpeed, explodeView, layoutTransitioning, outlinesView, pointerState, presentation, selectedTool, sketchActive, spacingView, temporaryAppInteraction],
  );
  const {
    tool: interactionTool,
    appInteractive,
    inspectionBarActive,
    debugView: activeDebugView,
    rendererInteractionsEnabled,
    rendererCursor,
    linksOpenInCards,
    commentToolActive,
  } = toolEffects;
  const boardCursor = toolEffects.boardCursor === "grabbing"
    ? "grabbing"
    : toolEffects.boardCursor === "pan"
      ? PAN_CURSOR
    : toolEffects.boardCursor === "comment"
      ? createCommentCursor(boardRef.current)
    : toolEffects.boardCursor === "design"
      ? DESIGN_SELECT_CURSOR
      : undefined;
  const activeDebugViewRef = useRef(activeDebugView);
  activeDebugViewRef.current = activeDebugView;
  const presentationCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id ?? null;
  const linkedFrameIds = getLinkedFrameIds(cards, selectedCardId);

  const [linkPreview, setLinkPreview] = useState<LinkPreviewState | null>(null);
  const linkPreviewTimerRef = useRef<number | null>(null);
  const linkPreviewHoveredRef = useRef(false);
  const linkPopoverRef = useRef<HTMLButtonElement | null>(null);
  const [linkPopoverSize, setLinkPopoverSize] = useState<{ readonly width: number; readonly height: number } | null>(null);

  const dismissLinkPreview = useCallback(() => {
    if (linkPreviewTimerRef.current !== null) {
      window.clearTimeout(linkPreviewTimerRef.current);
      linkPreviewTimerRef.current = null;
    }
    linkPreviewHoveredRef.current = false;
    setLinkPreview(null);
  }, []);

  const scheduleLinkPreviewDismiss = useCallback(() => {
    if (linkPreviewTimerRef.current !== null) window.clearTimeout(linkPreviewTimerRef.current);
    linkPreviewTimerRef.current = window.setTimeout(() => {
      linkPreviewTimerRef.current = null;
      if (!linkPreviewHoveredRef.current) setLinkPreview(null);
    }, 220);
  }, []);

  const keepLinkPreview = useCallback(() => {
    if (linkPreviewTimerRef.current !== null) {
      window.clearTimeout(linkPreviewTimerRef.current);
      linkPreviewTimerRef.current = null;
    }
    linkPreviewHoveredRef.current = true;
  }, []);

  const openLinkInNewFrame = useCallback((url: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized || normalized.origin !== window.location.origin) return;
    const card = getCanvasCards().find((candidate) => {
      const route = !iterationId(candidate.content) && normalizeUrl(contentSourceUrl(candidate.content));
      return route && normalizedUrlKey(route) === normalizedUrlKey(normalized);
    }) ?? addCanvasCard(url);
    selectCard(card.id);
    const board = boardRef.current;
    if (board) focusCanvasCards([card.id], { width: board.clientWidth, height: board.clientHeight });
    dismissLinkPreview();
  }, [dismissLinkPreview]);

  useEffect(() => {
    if (!linksOpenInCards) dismissLinkPreview();
  }, [dismissLinkPreview, linksOpenInCards]);

  useEffect(() => {
    if (!linkPreview) return;
    if (!linkPreview.frame.iframe.isConnected || !cards.some((card) => card.id === linkPreview.frame.cardId)) {
      dismissLinkPreview();
    }
  }, [cards, dismissLinkPreview, linkPreview]);

  useEffect(() => () => {
    if (linkPreviewTimerRef.current !== null) window.clearTimeout(linkPreviewTimerRef.current);
  }, []);

  // Measure the real popover before paint so the centering never assumes a guess.
  useLayoutEffect(() => {
    const popover = linkPopoverRef.current;
    if (!popover) {
      setLinkPopoverSize(null);
      return;
    }
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    setLinkPopoverSize((current) => (current?.width === width && current?.height === height ? current : { width, height }));
  }, [linkPreview?.url]);

  useLayoutEffect(() => {
    const previousPresentation = previousPresentationRef.current;
    previousPresentationRef.current = presentation;
    if (previousPresentation === presentation) return;
    presentationAnimationRef.current?.cancel();
    presentationAnimationRef.current = null;
    if (!presentationTransitioning) return;

    const board = boardRef.current;
    const card = cards.find((candidate) => candidate.id === presentationCardId);
    const cardElement = presentationCardId
      ? board?.querySelector<HTMLElement>(`[data-card-id="${presentationCardId}"]`)
      : null;
    if (!board || !card || !cardElement || typeof cardElement.animate !== "function" || camera.zoom <= 0) return;

    // The previous layout is gone, so derive it: focus fills the board, canvas places the card through the camera.
    const boardRect = snapshotRect(board.getBoundingClientRect());
    const canvasRect: RectSnapshot = {
      left: boardRect.left + camera.x + card.x * camera.zoom,
      top: boardRect.top + camera.y + card.y * camera.zoom,
      width: card.width * camera.zoom,
      height: card.height * camera.zoom,
    };
    const oldRect = presentation === "focus" ? canvasRect : boardRect;
    const localScale = presentation === "focus" ? 1 : camera.zoom;
    const newRect = snapshotRect(cardElement.getBoundingClientRect());
    if (newRect.width <= 0 || newRect.height <= 0) return;

    const localTranslateX = (oldRect.left + oldRect.width / 2 - (newRect.left + newRect.width / 2)) / localScale;
    const localTranslateY = (oldRect.top + oldRect.height / 2 - (newRect.top + newRect.height / 2)) / localScale;
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
      { duration: PRESENTATION_TRANSITION_MS, easing: PRESENTATION_TRANSITION_EASING, fill: "both" },
    );
    presentationAnimationRef.current = animation;
    void animation.finished.then(() => {
      if (presentationAnimationRef.current !== animation) return;
      presentationAnimationRef.current = null;
      animation.cancel();
    }).catch(() => undefined);
  }, [camera, cards, presentation, presentationCardId, presentationTransitioning]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!primaryUrl || !board) return;
    if (activatedPrimaryUrlRef.current === primaryUrl && cards.length > 0) return;
    activatedPrimaryUrlRef.current = primaryUrl;
    // The page is its own only card, so a restored zoomed-out board never applies.
    if (pageSurface && presentation !== "focus") setCanvasPresentation("focus");
    const viewport = {
      width: board.clientWidth,
      height: board.clientHeight,
    };
    const primaryCard = activateIframeWorkspace(primaryUrl, viewport, {
      replaceActiveCard: (pageSurface || presentation === "focus") && runtimeConfig.demo !== true,
      preserveIterationFocus: true,
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
  }, [primaryUrl, cards.length, pageSurface, presentation, runtimeConfig.demo, runtimeConfig.demoPages, runtimeConfig.demoCardLabels]);

  useEffect(() => {
    if (pageSurface) return;
    if (primaryUrl && activatedPrimaryUrlRef.current !== primaryUrl) return;
    const activeCardId = selectedCardId ?? focusedCardId ?? cards[0]?.id;
    const activeCard = cards.find((card) => card.id === activeCardId);
    if (!activeCard) return;
    const editorUrl = createNudgeUiEditorUrl(contentSourceUrl(activeCard.content));
    if (window.location.href !== editorUrl) {
      window.history.replaceState(window.history.state, "", editorUrl);
    }
  }, [cards, focusedCardId, primaryUrl, selectedCardId]);

  // One object describing what every renderer should currently show. Sending it whole means a frame that just loaded
  // cannot miss a piece, and a state change cannot forget to re-send one.
  const commentCursor = interactionTool === "comment" ? createCommentCursor(boardRef.current) : null;
  const desiredRendererState = useMemo(
    () => rendererDesiredState({
      open: inspectorOpen,
      interactionsEnabled: rendererInteractionsEnabled,
      cursor: rendererCursor,
      commentCursor,
      spaceHeld,
      boardGestures: presentation === "canvas",
      appInteractive,
      linkPreviews: linksOpenInCards,
      debugView: activeDebugView,
    }),
    [activeDebugView, appInteractive, commentCursor, inspectorOpen, linksOpenInCards, presentation, rendererCursor, rendererInteractionsEnabled, spaceHeld],
  );
  const desiredRendererStateRef = useRef(desiredRendererState);
  desiredRendererStateRef.current = desiredRendererState;

  useEffect(() => {
    sendRendererStateToAll(desiredRendererState);
  }, [desiredRendererState]);

  useEffect(() => {
    // Leaving Explode view starts from the page as it was; renderers still holding a subtree apart report again.
    if (!activeDebugView.xray) clearFramesExploded();
  }, [activeDebugView.xray]);

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
    updateSpaceHeld(false);
    endPanning();
    setBoardCursorClass("");
  }, [endPanning, updateSpaceHeld]);

  const leaveViewTool = useCallback(() => {
    if (selectedTool !== "debug") return;
    setInteractionTool("design");
    stopPanMode();
  }, [selectedTool, stopPanMode]);

  const handleToolChange = useCallback((nextTool: CanvasInteractionTool, source: "pointer" | "keyboard" = "pointer") => {
    if ((nextTool === "select" || nextTool === "debug") && selectedTool === nextTool) {
      setInteractionTool("design");
      stopPanMode();
      return;
    }
    if (nextTool === "select") {
      setSelectedElement(null);
    }

    if (nextTool === "sketch") {
      if (!sketchEnabled) return;
      const hostElement = canvasFrameHost(getActiveCanvasFrame());
      if (!hostElement) return;
      stopPanMode();
      setInteractionTool(nextTool);
      startSketch(hostElement, { viaKeyboard: source === "keyboard" });
      return;
    }

    if (sketchActive) cancelSketchInteraction();

    setInteractionTool(nextTool);
    stopPanMode();
  }, [selectedTool, sketchActive, sketchEnabled, stopPanMode]);

  // O and X switch their view while the Inspection tool is up, and bring it up with that view on when it is not. D, like
  // the toolbar button, toggles the tool.
  const handleToolShortcut = useCallback((code: string, nextTool: CanvasInteractionTool) => {
    const view = inspectionViewForCode(code);
    if (view) {
      const [get, set] = view === "outlines" ? [getOutlinesView, setOutlinesView] : [getExplodeView, setExplodeView];
      set(selectedTool === "debug" ? !get() : true);
      if (selectedTool !== "debug") handleToolChange("debug", "keyboard");
      return;
    }
    handleToolChange(nextTool, "keyboard");
  }, [handleToolChange, selectedTool]);

  useEffect(() => () => setCommentToolActive(false), []);

  // Putting the Inspection tool away switches Explode off, since it takes over the page's clicks, and puts the speed back
  // to full, so the panel opens again from a clean start.
  useEffect(() => {
    if (selectedTool === "debug") return;
    setExplodeView(false);
    setAnimationSpeed(MAX_ANIMATION_SPEED);
  }, [selectedTool]);

  // Key handlers read this to decide whether the page keeps the keys the inspector acts on.
  useEffect(() => {
    setAppToolActive(selectedTool === "select");
    return () => setAppToolActive(false);
  }, [selectedTool]);

  useEffect(() => {
    setCommentToolActive(commentToolActive);
    if (temporaryAppInteraction) stopPanMode();
  }, [commentToolActive, temporaryAppInteraction, stopPanMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode === "canvas" && event.code === APP_INTERACTION_KEY && !event.repeat && !isEditableEvent(event)) setTemporaryAppInteraction(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === APP_INTERACTION_KEY) setTemporaryAppInteraction(false);
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
      // Not consumed: Escape still deselects after the debug tools are put away.
      if (event.key === "Escape") leaveViewTool();
      const nextTool = canvasToolForEvent(event);
      if (!nextTool || (nextTool === "sketch" && !sketchAvailable)) return;
      // While sketching, P belongs to the sketch bar (it picks the pen). Starting the sketch again would also abort a
      // copy that is still being captured.
      if (nextTool === "sketch" && sketchActive) return;
      claimShortcutKey(event);
      handleToolShortcut(event.code, nextTool);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleToolShortcut, leaveViewTool, mode, sketchActive, sketchAvailable]);

  const handleZoomStep = useCallback((direction: -1 | 1) => {
    if (sketchActive) return;
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
  }, [presentation, sketchActive]);

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

  const createIteration = useCallback(async (cardId: string, position?: { x: number; y: number }) => {
    const iteration = await createWorkspaceIteration(cardId, position);
    setSelectedElement(null);
    const board = boardRef.current;
    if (board && !position) focusCanvasCards([iteration.id], { width: board.clientWidth, height: board.clientHeight });
    return iteration.id;
  }, []);

  useEffect(() => {
    if (!sketchActive && interactionTool === "sketch") {
      setInteractionTool("design");
    }
  }, [interactionTool, sketchActive]);

  useLayoutEffect(() => {
    if (presentation !== "focus") return;
    endPanning();
    updateSpaceHeld(false);
    setBoardCursorClass("");
  }, [endPanning, presentation, updateSpaceHeld]);

  useEffect(() => {
    const stopChanges = subscribeActiveDraftChanges(() => {
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
    return subscribeCanvasRendererMessages(({ frame, message: msg }) => {
      const { identity } = frame;
      if (msg.type === "renderer-hello") return;
      if (msg.type === "app-interaction-modifier") {
        if (mode === "canvas") setTemporaryAppInteraction(msg.held === true);
        return;
      }
      if (msg.type === "link-preview") {
        if (!linksOpenInCards) return;
        if (!msg.url || !msg.rect) {
          scheduleLinkPreviewDismiss();
          return;
        }
        if (linkPreviewTimerRef.current !== null) {
          window.clearTimeout(linkPreviewTimerRef.current);
          linkPreviewTimerRef.current = null;
        }
        linkPreviewHoveredRef.current = false;
        setLinkPreview({ frame, url: msg.url, rect: msg.rect, point: msg.point ?? null });
        return;
      }
      if (isKeyboardShortcutMessage(msg, identity)) {
        if (msg.phase === "keydown") {
          if (msg.code === "Escape") {
            leaveViewTool();
            return;
          }
          const nextTool = canvasToolForCode(msg.code);
          if (nextTool && (nextTool !== "sketch" || (sketchAvailable && !sketchActive))) handleToolShortcut(msg.code, nextTool);
        }
        return;
      }
      if (isDebugViewPhaseMessage(msg, identity)) {
        // Only a renderer in Explode view can report this, and only that view hides the controller's chrome.
        setFrameExploded(frame.cardId, msg.exploded && activeDebugViewRef.current.xray);
        return;
      }
      const syncActiveFrameUrl = (url: string): void => {
        if (getCanvasCards().some((card) => card.id === frame.cardId && iterationId(card.content))) return;
        const activeCardId = getSelectedCardId() ?? getFocusedCardId() ?? getCanvasCards()[0]?.id;
        if (!pageSurface && (activeCardId === frame.cardId || getCanvasCards().length === 1)) {
          window.history.replaceState(window.history.state, "", createNudgeUiEditorUrl(url));
        }
        updateCardUrl(frame.cardId, url);
      };
      if (isProjectionAppliedMessage(msg, identity)) {
        recordCanvasProjectionApplied(frame.cardId, msg.revision);
        // Peek shows the page without inspector changes; skip conflict verification.
        if (isOriginalPreviewActive()) return;
        const frameDocument = frame.document();
        const plan = getCanonicalFrameProjection(frame.cardId, msg.revision);
        const draft = getDraftForCard(frame.cardId);
        if (frameDocument && plan && draft && isCanvasCanonicalProjectionRevisionCurrent(frameDocument, msg.revision)) {
          const attempt = beginPreviewAttempt(
            getCanvasPreviewDocument(frame.cardId),
            plan.draftRevision,
          );
          if (attempt) {
            verifyPreviewChanges({
              changes: draft.contents.changes,
              document: frameDocument,
              attempt,
              targetFor: () => null,
              isCurrent: () => isCanvasCanonicalProjectionRevisionCurrent(frameDocument, msg.revision),
              retryAnimation: (run) => window.setTimeout(run, 300),
            });
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
        syncActiveFrameUrl(msg.url);
        // A reloaded document is whole again, whatever the document it replaced was showing.
        setFrameExploded(frame.cardId, false);
        sendRendererState(frame, desiredRendererStateRef.current);
      }
      if (msg.type === "pan-modifier") {
        if (presentation !== "canvas") return;
        updateSpaceHeld(msg.spaceHeld);
        if (!panningRef.current) {
          setBoardCursorClass(msg.spaceHeld ? "is-grabbable" : "");
        }
        return;
      }
      if (msg.type === "wheel-pan") {
        if (presentation === "canvas" && !sketchActive && !appInteractive) panCanvasByWheel(msg.deltaX, msg.deltaY);
        return;
      }
      if (msg.type === "zoom") {
        if (presentation !== "canvas" || sketchActive) return;
        zoomAtPointer(toViewportPoint(frame.viewport(), msg.point), msg.deltaY);
        return;
      }
      // The pan moves the frame, so every pan point maps through the viewport captured at pan start.
      const pointInBoard = (point: { x: number; y: number }) => {
        const context = framePanContextRef.current;
        return context ? toViewportPoint(context, point) : null;
      };
      if (msg.type === "pan-start") {
        if (sketchActive) return;
        framePanContextRef.current = frame.viewport();
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
        const frameDocument = frame.document();
        if (frameDocument) disposeInlineTextEdit("route-disposed", frameDocument);
        if (msg.url) syncActiveFrameUrl(msg.url);
        dismissLinkPreview();
        return;
      }
      if (msg.type !== "navigation-intent") return;
      dismissLinkPreview();
      if (getCanvasCards().some((card) => card.id === frame.cardId && iterationId(card.content))) return;
      const normalized = normalizeUrl(msg.url);
      if (!normalized || normalized.origin !== window.location.origin) return;
      const frameDocument = frame.document();
      if (frameDocument) disposeInlineTextEdit("route-disposed", frameDocument);
    });
  }, [appInteractive, dismissLinkPreview, endPanning, handleToolShortcut, interactionTool, leaveViewTool, linksOpenInCards, mode, panCanvasByWheel, inspectorOpen, movePanning, presentation, rendererCursor, rendererInteractionsEnabled, scheduleLinkPreviewDismiss, selectedTool, sketchActive, sketchAvailable, startPanning, updateSpaceHeld, zoomAtPointer]);

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
      if (mode !== "canvas" || presentation !== "canvas" || sketchActive) return;
      // Normal mode leaves Delete to the app; Space still pans the board.
      if (!appInteractive && (e.key === "Delete" || e.key === "Backspace") && !isEditableEvent(e)) {
        if (e.defaultPrevented || getSelectedElements().length > 0 || getCanvasCards().length < 2) return;
        const selectedCardId = getSelectedCardId();
        if (!selectedCardId) return;
        e.preventDefault();
        removeFrame(selectedCardId);
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        if (isEditableEvent(e)) return;
        e.preventDefault();
        updateSpaceHeld(true);
        if (!panningRef.current) {
          setBoardCursorClass("is-grabbable");
        }
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") {
        updateSpaceHeld(false);
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
  }, [appInteractive, mode, presentation, sketchActive, updateSpaceHeld]);

  const handleBoardClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (presentation !== "canvas" || sketchActive || spaceHeldRef.current || panningRef.current) return;
    if (event.target === event.currentTarget
      || (event.target instanceof HTMLElement && event.target.dataset.test === "canvas-board-content")) {
      setSelectedElement(null);
      deselectCard();
    }
  }, [presentation, sketchActive]);

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
      const path = e.composedPath();
      if (sketchActive && path.some((node) => node instanceof Element && node.closest(".panel"))) return;
      // Comment pins overlay the board without being its DOM descendants.
      const overCommentPin = path.some((node) => node instanceof Element && node.matches(".comment-pin"));
      // The sketch surface covers the board, and frame documents keep their own scrolling in normal mode.
      const overBoard = sketchActive || (board !== null && path.includes(board)) || overCommentPin;
      if (!zoom && (!board || !overBoard)) return;
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
  }, [mode, presentation, sketchActive, panCanvasByWheel, zoomAtPointer]);

  // Every page card would share the one page renderer, so extra restored cards stay unmounted.
  const renderCard = (card: CanvasCardData) => pageSurface ? (
    card.id === presentationCardId ? <PageCard key={card.id} card={card} documentOwner={inspectorSession} /> : null
  ) : (
    <CanvasCard
      key={card.id}
      card={card}
      presentation={presentation}
      presentationCard={card.id === presentationCardId}
      linkedToActive={linkedFrameIds.includes(card.id)}
      onShowFocus={showFocus}
      onDuplicate={duplicateDesign}
      onCreateIteration={canvasIterationsEnabled ? createIteration : undefined}
      documentOwner={inspectorSession}
    />
  );

  if (mode !== "canvas") return null;

  const linkPreviewViewport = linkPreview && linkPreview.frame.iframe.isConnected
    ? toViewportRect(linkPreview.frame.viewport(), linkPreview.rect)
    : null;
  const linkPointerViewport = linkPreview?.point
    ? toViewportPoint(linkPreview.frame.viewport(), linkPreview.point)
    : null;
  const boardBounds = boardRef.current?.getBoundingClientRect() ?? null;
  const linkPopoverAnchor: LinkPopoverAnchor | null = linkPreviewViewport
    ? { kind: "rect", rect: linkPreviewViewport }
    : linkPointerViewport
      ? { kind: "point", x: linkPointerViewport.x, y: linkPointerViewport.y }
      : null;
  const linkPopoverPosition = linkPopoverAnchor && boardBounds
    ? placeLinkPopover(linkPopoverAnchor, linkPopoverSize ?? { width: LINK_POPOVER_WIDTH, height: LINK_POPOVER_HEIGHT }, boardBounds)
    : null;

  return (
    <>
      <InspectorStyle testId="canvas-styles" css={WORKSPACE_STYLES} />
      <div
        className={`canvas-workspace${presentationTransitioning ? " is-presentation-transitioning" : ""}`}
        data-test="canvas-workspace"
        data-presentation={presentation}
        data-surface={pageSurface ? "page" : undefined}
        style={inspectorOpen ? PANEL_RESERVED_INSET : undefined}
      >
        <div
          className={`canvas-workspace__board ${boardCursorClass}${layoutTransitioning ? " is-layout-transitioning" : ""}`.trim()}
          data-test="canvas-board"
          ref={boardRef}
          style={{ cursor: boardCursor }}
          onPointerDown={handleBoardPointerDown}
          onClick={handleBoardClick}
        >
          {!primaryUrl ? (
            <div className="canvas-workspace__target-error" data-test="canvas-target-error">
              This editor URL does not identify an application page.
            </div>
          ) : null}
          {inspectorOpen && presentation === "focus" && !pageSurface ? (
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
            {cards.map(renderCard)}
          </div>
        </div>
        {linkPreview && linkPopoverPosition ? (
          <button
            type="button"
            ref={linkPopoverRef}
            className="canvas-link-popover"
            data-test="canvas-link-popover"
            style={{ left: linkPopoverPosition.left, top: linkPopoverPosition.top }}
            onPointerEnter={keepLinkPreview}
            onPointerLeave={scheduleLinkPreviewDismiss}
            onClick={() => openLinkInNewFrame(linkPreview.url)}
          >
            <IconExternalLink size={14} stroke="var(--icon-stroke-width)" aria-hidden="true" />
            <span>Open in new frame</span>
          </button>
        ) : null}
      </div>
      <div
        className="canvas-toolbar__portal"
        data-sketching={sketchActive ? "true" : "false"}
        data-test="canvas-toolbar-portal"
        style={inspectorOpen ? PANEL_RESERVED_INSET : undefined}
      >
        {/* Shares the toolbar's layer, above the page overlays, rather than the board's. */}
        {!sketchActive && inspectionBarActive ? <InspectionBar /> : null}
        <CanvasToolbar
          tool={interactionTool}
          sketchEnabled={sketchAvailable}
          onToolChange={handleToolChange}
        />
      </div>
    </>
  );
}
