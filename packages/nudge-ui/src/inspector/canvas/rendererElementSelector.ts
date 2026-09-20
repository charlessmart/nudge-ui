import {
  PROTOCOL_VERSION,
  getRendererIdentity,
  sendToParent,
  type ElementClickMessage,
  type ElementDeselectMessage,
  type ElementHoverMessage,
  type ElementMeasureStateMessage,
  type ElementDeleteMessage,
  type ElementNudgeMessage,
  type HistoryRequestMessage,
  type InspectorToggleRequestMessage,
  type InspectorOpenRequestMessage,
  type ElementDragEndMessage,
  type ElementDragMoveMessage,
  type ElementDragStartMessage,
  type InlineTextIntentMessage,
} from "./frameProtocol.ts";
import {
  findClosestAnchor,
  isEligibleNavigation,
  hasDifferentRoute,
  shouldPreserveNativeLinkActivation,
} from "./linkEligibility.ts";
import { readBorderWidths, readMargins } from "../overlay/overlayGeometry.ts";
import { installInteractionStyles } from "../overlay/interactionStyles.ts";
import { createFrameThrottle } from "../overlay/frameThrottle.ts";
import { createCidIndex } from "./rendererCidIndex.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { isEditableEvent, isInspectorToggleShortcut } from "../shell/shortcuts.ts";
import { resolveSelectionTarget, selectionTargetMode } from "../selection/selectionTarget.ts";
import { escapeCssString } from "../projection/cssEscapes.ts";
import { blockApplicationClick, isApplicationActivationClick } from "../overlay/clickPolicy.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";
import {
  getSpacingAffordanceAtPoint,
  toSpacingDescriptor,
  type SpacingDescriptor,
} from "../overlay/spacingGestures.ts";

const REACT_FIBER_KEY = /^__reactFiber\$/;
const REACT_INTERNAL_KEY = /^__reactInternalInstance\$/;

function findFiber(el: HTMLElement): unknown {
  const keys = Object.keys(el);
  for (const key of keys) {
    if (REACT_FIBER_KEY.test(key) || REACT_INTERNAL_KEY.test(key)) {
      return Reflect.get(el, key);
    }
  }
  return undefined;
}

function getFiberInfo(el: HTMLElement) {
  const fiber = findFiber(el) as Record<string, unknown> | undefined;
  const src = el.getAttribute("data-src") ?? "";

  let file = "";
  let line = 0;
  let component = "Component";

  if (fiber) {
    let node: Record<string, unknown> | undefined = fiber;
    while (node) {
      const debugSource = node._debugSource as { fileName?: string; lineNumber?: number } | undefined;
      if (debugSource) {
        file = debugSource.fileName ?? "";
        line = debugSource.lineNumber ?? 0;
        break;
      }
      node = (node._debugOwner as Record<string, unknown> | undefined)
        ?? (node.return as Record<string, unknown> | undefined);
    }

    const fiberType = fiber.type as Record<string, unknown> | string | undefined;
    if (typeof fiberType === "string") {
      component = fiberType;
    } else if (fiberType && typeof fiberType === "object") {
      const displayName = (fiberType as Record<string, unknown>).displayName;
      if (typeof displayName === "string") {
        component = displayName;
      } else {
        const name = (fiberType as Record<string, unknown>).name;
        if (typeof name === "string") {
          component = name;
        }
      }
    }
  }

  if (!file) {
    const match = /^(.*):(\d+):(\d+)$/.exec(src);
    if (match) {
      file = match[1] ?? "";
      line = Number(match[2]) || 0;
    }
  }

  return { file, line, component, src };
}

export function buildSelector(el: HTMLElement): string {
  const cid = el.getAttribute("data-cid");
  if (cid) return `[data-cid="${escapeCssString(cid)}"]`;
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${CSS.escape(el.id)}` : "";
  const classes = Array.from(el.classList).map((c) => `.${CSS.escape(c)}`).join("");
  return tag + id + classes;
}

let installed = false;
const noopDisposal = (): void => undefined;

export function installRendererElementSelector(): () => void {
  if (!isNudgeUiDev()) return noopDisposal;
  if (installed) return noopDisposal;
  installed = true;
  const removeInteractionStyles = installInteractionStyles();
  const listenerCleanup: Array<() => void> = [];
  let disposed = false;

  function trackListener<E extends Event>(
    target: Document | Window,
    type: string,
    listener: (event: E) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const eventListener: EventListener = (event) => listener(event as E);
    target.addEventListener(type, eventListener, options);
    listenerCleanup.push(() => target.removeEventListener(type, eventListener, options));
  }

  const cidIndex = createCidIndex(document);
  const hoverUpdate = createFrameThrottle((pending: {
    element: HTMLElement;
    clear: boolean;
    point: { x: number; y: number } | null;
  }) => {
    if (disposed) return;
    const { element, clear } = pending;
    const identity = getRendererIdentity();
    if (!identity) return;

    const cid = element.getAttribute("data-cid")!;
    const selector = buildSelector(element);
    const src = element.getAttribute("data-src") ?? "";
    const rect = clear ? null : element.getBoundingClientRect();
    const spacing = !clear && pending.point
      ? getSpacingAffordanceAtPoint(document, pending.point.x, pending.point.y)
      : null;

    const msg: ElementHoverMessage = {
      type: "element-hover",
      protocolVersion: PROTOCOL_VERSION,
      cid,
      selector,
      src,
      elementId: cidIndex.elementId(element),
      rect: rect
        ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
        : null,
      margins: rect ? readMargins(element) : null,
      borders: rect ? readBorderWidths(element) : null,
      point: pending.point,
      spacing: spacing && spacing.element === element ? toSpacingDescriptor(spacing) : null,
      ...identity,
    };

    sendToParent(msg);
  });

  let measurePointerOverPage = false;
  let measureAltKey = false;

  function updateMeasureState(altKey: boolean, pointerOverPage: boolean): void {
    if (disposed) return;
    if (measureAltKey === altKey && measurePointerOverPage === pointerOverPage) return;
    measureAltKey = altKey;
    measurePointerOverPage = pointerOverPage;
    const identity = getRendererIdentity();
    if (!identity) return;
    const msg: ElementMeasureStateMessage = {
      type: "element-measure-state",
      protocolVersion: PROTOCOL_VERSION,
      altKey,
      pointerOverPage,
      ...identity,
    };
    sendToParent(msg);
  }

  trackListener<MouseEvent>(
    document,
    "mouseover",
    (event: MouseEvent) => {
      if (interactionsSuspended) return;
      updateMeasureState(event.altKey, true);
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = resolveSelectionTarget(target, selectionTargetMode(event));
      if (!el) return;

      const point = { x: event.clientX, y: event.clientY };
      updateSpacingCursor(point);
      hoverUpdate.schedule({ element: el, clear: false, point });
    },
    true,
  );

  let pendingDrag: {
    element: HTMLElement;
    point: { x: number; y: number };
    spacing: SpacingDescriptor | null;
  } | null = null;
  let dragging = false;
  let lastDragPoint = { x: 0, y: 0 };
  let lastSelected: HTMLElement | null = null;
  let interactionsSuspended = false;

  function updateSpacingCursor(point: { x: number; y: number }): void {
    if (interactionsSuspended) return;
    const affordance = getSpacingAffordanceAtPoint(document, point.x, point.y);
    document.documentElement.style.cursor = affordance?.cursor ?? "";
  }

  trackListener<Event>(window, "nudge-ui:open", () => {
    const identity = getRendererIdentity();
    if (!identity) return;
    const message: InspectorOpenRequestMessage = {
      type: "inspector-open-request",
      protocolVersion: PROTOCOL_VERSION,
      ...identity,
    };
    sendToParent(message);
  });

  trackListener<MessageEvent>(window, "message", (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const identity = getRendererIdentity();
    const message = event.data as Record<string, unknown> | null;
    if (!identity || !message
      || message.protocolVersion !== PROTOCOL_VERSION
      || message.projectId !== identity.projectId
      || message.workspaceId !== identity.workspaceId
      || message.cardId !== identity.cardId) return;
    if (message.type === "measure-modifier" && typeof message.altKey === "boolean") {
      updateMeasureState(message.altKey, measurePointerOverPage);
      return;
    }
    if (message.type !== "inspector-interaction-state" || typeof message.open !== "boolean") return;
    interactionsSuspended = !message.open;
    if (message.open) {
      document.documentElement.setAttribute("data-nudge-ui-panel", "open");
    } else {
      document.documentElement.removeAttribute("data-nudge-ui-panel");
    }
    if (interactionsSuspended) {
      cancelActiveDrag();
      hoverUpdate.cancel();
      document.documentElement.style.cursor = "";
      updateMeasureState(false, false);
    }
  });

  const dragMoveUpdate = createFrameThrottle((point: { x: number; y: number }) => {
    if (disposed) return;
    const identity = getRendererIdentity();
    if (!point || !identity) return;
    const msg: ElementDragMoveMessage = { type: "element-drag-move", protocolVersion: PROTOCOL_VERSION, point, ...identity };
    sendToParent(msg);
  });

  function sendDragEnd(point: { x: number; y: number }, cancelled: boolean): void {
    if (!dragging) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    const msg: ElementDragEndMessage = {
      type: "element-drag-end",
      protocolVersion: PROTOCOL_VERSION,
      point,
      ...(cancelled ? { cancelled: true } : {}),
      ...identity,
    };
    sendToParent(msg);
  }

  function cancelActiveDrag(): void {
    dragMoveUpdate.cancel();
    sendDragEnd(lastDragPoint, true);
    pendingDrag = null;
    dragging = false;
  }

  trackListener<MouseEvent>(document, "mousedown", (event: MouseEvent) => {
    if (interactionsSuspended) return;
    if (event.button !== 0) return;
    const element = resolveSelectionTarget(event.target, selectionTargetMode(event));
    if (!element) return;
    const spacingAffordance = getSpacingAffordanceAtPoint(document, event.clientX, event.clientY);
    const spacing = spacingAffordance?.element === element
      ? toSpacingDescriptor(spacingAffordance)
      : null;
    const identity = getRendererIdentity();
    // A spacing drag owns the pointer gesture. Do not start an inline-text
    // attempt for the same down event; padding and gaps are intentionally not
    // editable text targets.
    if (identity && !spacing) {
      const emptyProjectionId = event.target instanceof Element
        ? event.target.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)?.getAttribute(EMPTY_TEXT_PROJECTION_ATTR) ?? undefined
        : undefined;
      const message: InlineTextIntentMessage = {
        type: "inline-text-intent",
        protocolVersion: PROTOCOL_VERSION,
        intent: emptyProjectionId && event.detail >= 2 ? "double-click" : "pointer-down",
        cid: element.getAttribute("data-cid")!,
        src: element.getAttribute("data-src") ?? "",
        elementId: cidIndex.elementId(element),
        point: { x: event.clientX, y: event.clientY },
        clickCount: event.detail,
        emptyProjectionId,
        ...identity,
      };
      sendToParent(message);
    }
    lastSelected = element;
    pendingDrag = {
      element,
      point: { x: event.clientX, y: event.clientY },
      spacing,
    };
    lastDragPoint = { x: event.clientX, y: event.clientY };
  }, true);

  trackListener<MouseEvent>(document, "mousemove", (event: MouseEvent) => {
    if (!pendingDrag) {
      if (interactionsSuspended) return;
      const target = event.target;
      if (target instanceof Element) {
        const element = resolveSelectionTarget(target, selectionTargetMode(event));
        if (element) {
          const point = { x: event.clientX, y: event.clientY };
          updateSpacingCursor(point);
          hoverUpdate.schedule({ element, clear: false, point });
        }
      }
      return;
    }
    if (!dragging && Math.hypot(event.clientX - pendingDrag.point.x, event.clientY - pendingDrag.point.y) < 6) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    lastDragPoint = point;
    if (!dragging) {
      dragging = true;
      const msg: ElementDragStartMessage = {
        type: "element-drag-start", protocolVersion: PROTOCOL_VERSION,
        cid: pendingDrag.element.getAttribute("data-cid")!, src: pendingDrag.element.getAttribute("data-src") ?? "",
        elementId: cidIndex.elementId(pendingDrag.element), point,
        startPoint: pendingDrag.point,
        spacing: pendingDrag.spacing,
        ...identity,
      };
      sendToParent(msg);
    } else {
      dragMoveUpdate.schedule(point);
    }
  }, true);

  function finishDrag(event: MouseEvent): void {
    dragMoveUpdate.cancel();
    if (dragging) {
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      lastDragPoint = point;
      sendDragEnd(point, false);
    }
    pendingDrag = null;
    dragging = false;
  }
  trackListener<MouseEvent>(document, "mouseup", finishDrag, true);

  trackListener<KeyboardEvent>(document, "keydown", (event: KeyboardEvent) => {
    if (isEditableEvent(event)) return;
    if (isInspectorToggleShortcut(event)) {
      const identity = getRendererIdentity();
      if (!identity) return;
      event.preventDefault();
      const msg: InspectorToggleRequestMessage = {
        type: "inspector-toggle-request",
        protocolVersion: PROTOCOL_VERSION,
        ...identity,
      };
      sendToParent(msg);
      return;
    }
    if (interactionsSuspended) return;
    if (event.key === "Alt") updateMeasureState(true, measurePointerOverPage);
    const scrollKey = event.code === "Space"
      || event.key === "ArrowUp"
      || event.key === "ArrowDown"
      || event.key === "ArrowLeft"
      || event.key === "ArrowRight";
    if (scrollKey) event.preventDefault();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      const identity = getRendererIdentity();
      if (!identity) return;
      event.preventDefault();
      const msg: HistoryRequestMessage = {
        type: "history-request",
        protocolVersion: PROTOCOL_VERSION,
        action: event.shiftKey ? "redo" : "undo",
        ...identity,
      };
      sendToParent(msg);
      return;
    }
    if (event.key === "Escape" || event.key === "Esc") {
      event.preventDefault();
      lastSelected = null;
      const identity = getRendererIdentity();
      if (!identity) return;
      const msg: ElementDeselectMessage = {
        type: "element-deselect",
        protocolVersion: PROTOCOL_VERSION,
        ...identity,
      };
      sendToParent(msg);
      return;
    }
    if (!lastSelected) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const msg: ElementDeleteMessage = {
        type: "element-delete", protocolVersion: PROTOCOL_VERSION,
        cid: lastSelected.getAttribute("data-cid")!, src: lastSelected.getAttribute("data-src") ?? "",
        elementId: cidIndex.elementId(lastSelected), ...identity,
      };
      sendToParent(msg);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const msg: ElementNudgeMessage = {
      type: "element-nudge", protocolVersion: PROTOCOL_VERSION,
      cid: lastSelected.getAttribute("data-cid")!, src: lastSelected.getAttribute("data-src") ?? "",
      elementId: cidIndex.elementId(lastSelected), key: event.key, ...identity,
    };
    sendToParent(msg);
  }, true);

  trackListener<KeyboardEvent>(document, "keyup", (event: KeyboardEvent) => {
    if (event.key === "Alt") updateMeasureState(false, measurePointerOverPage);
  }, true);

  trackListener<Event>(window, "blur", () => {
    cancelActiveDrag();
    updateMeasureState(false, false);
  });

  trackListener<MouseEvent>(
    document,
    "mouseout",
    (event: MouseEvent) => {
      if (interactionsSuspended) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const related = event.relatedTarget;
      if (!(related instanceof Node) || !document.contains(related)) {
        updateMeasureState(event.altKey, false);
      }
      if (related instanceof Node && (target.contains(related) || target === related)) return;

      if (!(target instanceof Element)) return;
      const el = resolveSelectionTarget(target, selectionTargetMode(event));
      if (!el) return;

      if (resolveSelectionTarget(related, selectionTargetMode(event))) return;

      document.documentElement.style.cursor = "";
      hoverUpdate.schedule({ element: el, clear: true, point: null });
    },
    true,
  );

  trackListener<MouseEvent>(
    document,
    "dblclick",
    (event: MouseEvent) => {
      if (interactionsSuspended) return;
      const element = resolveSelectionTarget(event.target, selectionTargetMode(event));
      const identity = getRendererIdentity();
      if (!element || !identity) return;
      blockApplicationClick(event);
      const message: InlineTextIntentMessage = {
        type: "inline-text-intent",
        protocolVersion: PROTOCOL_VERSION,
        intent: "double-click",
        cid: element.getAttribute("data-cid")!,
        src: element.getAttribute("data-src") ?? "",
        elementId: cidIndex.elementId(element),
        point: { x: event.clientX, y: event.clientY },
        emptyProjectionId: event.target instanceof Element
          ? event.target.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)?.getAttribute(EMPTY_TEXT_PROJECTION_ATTR) ?? undefined
          : undefined,
        ...identity,
      };
      sendToParent(message);
    },
    true,
  );

  trackListener<MouseEvent>(
    document,
    "click",
    (event: MouseEvent) => {
      if (interactionsSuspended) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Defer to navigation-intent when the user clicked a navigable same-origin
      // anchor that points to a different route. The later listener reports the
      // intent to the controller while leaving native or framework navigation in
      // charge of the live application document.
      const anchor = findClosestAnchor(target);
      if (anchor && isEligibleNavigation(anchor, event) && hasDifferentRoute(anchor)) {
        return;
      }

      // Command/Ctrl+Shift-click is the deliberate escape hatch for running
      // the application action. All other selected canvas clicks are editing
      // gestures and must not reach the rendered application.
      if (isApplicationActivationClick(event)) return;

      const preserveNativeLink = anchor
        ? shouldPreserveNativeLinkActivation(anchor, event)
        : false;

      const el = resolveSelectionTarget(target, selectionTargetMode(event));
      if (!el) {
        if (!preserveNativeLink) blockApplicationClick(event);
        return;
      }
      lastSelected = el;

      if (!preserveNativeLink) blockApplicationClick(event);

      const cid = el.getAttribute("data-cid")!;
      const selector = buildSelector(el);
      const { file, line, component, src } = getFiberInfo(el);
      const identity = getRendererIdentity();
      if (!identity) return;

      const msg: ElementClickMessage = {
        type: "element-click",
        protocolVersion: PROTOCOL_VERSION,
        cid,
        selector,
        src,
        elementId: cidIndex.elementId(el),
        file,
        line,
        component,
        additive: event.shiftKey && !event.ctrlKey && !event.metaKey,
        ...identity,
      };

      sendToParent(msg);
    },
    true,
  );

  return () => {
    if (disposed) return;
    cancelActiveDrag();
    disposed = true;
    installed = false;
    hoverUpdate.cancel();
    for (const cleanup of listenerCleanup) cleanup();
    listenerCleanup.length = 0;
    removeInteractionStyles();
    lastSelected = null;
    measurePointerOverPage = false;
    measureAltKey = false;
    document.documentElement.removeAttribute("data-nudge-ui-panel");
    document.documentElement.style.cursor = "";
  };
}
