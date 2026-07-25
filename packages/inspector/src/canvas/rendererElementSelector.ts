import {
  PROTOCOL_VERSION,
  getRendererIdentity,
  sendToParent,
  type ElementClickMessage,
  type ElementHoverMessage,
  type ElementDeleteMessage,
  type ElementNudgeMessage,
  type ElementDragEndMessage,
  type ElementDragMoveMessage,
  type ElementDragStartMessage,
} from "./frameProtocol.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";
import { installInteractionStyles } from "../interactionStyles.ts";
import { createFrameThrottle } from "../frameThrottle.ts";

const REACT_FIBER_KEY = /^__reactFiber\$/;
const REACT_INTERNAL_KEY = /^__reactInternalInstance\$/;

function findFiber(el: HTMLElement): unknown {
  const keys = Object.keys(el);
  for (const key of keys) {
    if (REACT_FIBER_KEY.test(key) || REACT_INTERNAL_KEY.test(key)) {
      return (el as unknown as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function getFiberInfo(el: HTMLElement): { file: string; line: number; component: string; src: string } {
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

function buildSelector(el: HTMLElement): string {
  const cid = el.getAttribute("data-cid");
  if (cid) return `[data-cid="${cid}"]`;
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${CSS.escape(el.id)}` : "";
  const classes = Array.from(el.classList).map((c) => `.${CSS.escape(c)}`).join("");
  return tag + id + classes;
}

let installed = false;

function instanceIndex(el: HTMLElement): number {
  const cid = el.getAttribute("data-cid");
  const src = el.getAttribute("data-src");
  if (!cid) return 0;
  return Array.from(document.querySelectorAll<HTMLElement>("[data-cid]")).filter((candidate) => (
    candidate.getAttribute("data-cid") === cid && candidate.getAttribute("data-src") === src
  )).indexOf(el);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

export function installRendererElementSelector(): void {
  if (!import.meta.env.DEV) return;
  if (installed) return;
  installed = true;
  installInteractionStyles();

  document.addEventListener(
    "mouseover",
    (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const el = target.closest("[data-cid]");
      if (!(el instanceof HTMLElement)) return;

      const rect = el.getBoundingClientRect();
      const cid = el.getAttribute("data-cid")!;
      const selector = buildSelector(el);
      const identity = getRendererIdentity();
      if (!identity) return;

      const msg: ElementHoverMessage = {
        type: "element-hover",
        protocolVersion: PROTOCOL_VERSION,
        cid,
        selector,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        ...identity,
      };

      sendToParent(msg);
    },
    true,
  );

  let pendingDrag: { element: HTMLElement; point: { x: number; y: number } } | null = null;
  let dragging = false;
  let lastSelected: HTMLElement | null = null;

  const dragMoveUpdate = createFrameThrottle((point: { x: number; y: number }) => {
    const identity = getRendererIdentity();
    if (!point || !identity) return;
    const msg: ElementDragMoveMessage = { type: "element-drag-move", protocolVersion: PROTOCOL_VERSION, point, ...identity };
    sendToParent(msg);
  });

  document.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof HTMLElement)) return;
    const element = event.target.closest("[data-cid]");
    if (!(element instanceof HTMLElement)) return;
    pendingDrag = { element, point: { x: event.clientX, y: event.clientY } };
  }, true);

  document.addEventListener("mousemove", (event: MouseEvent) => {
    if (!pendingDrag) return;
    if (!dragging && Math.hypot(event.clientX - pendingDrag.point.x, event.clientY - pendingDrag.point.y) < 6) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    if (!dragging) {
      dragging = true;
      const msg: ElementDragStartMessage = {
        type: "element-drag-start", protocolVersion: PROTOCOL_VERSION,
        cid: pendingDrag.element.getAttribute("data-cid")!, src: pendingDrag.element.getAttribute("data-src") ?? "",
        instanceIndex: instanceIndex(pendingDrag.element), point, ...identity,
      };
      sendToParent(msg);
    } else {
      dragMoveUpdate.schedule(point);
    }
  }, true);

  function finishDrag(event: MouseEvent): void {
    dragMoveUpdate.cancel();
    if (dragging) {
      const identity = getRendererIdentity();
      if (identity) {
        event.preventDefault();
        const msg: ElementDragEndMessage = {
          type: "element-drag-end", protocolVersion: PROTOCOL_VERSION,
          point: { x: event.clientX, y: event.clientY }, ...identity,
        };
        sendToParent(msg);
      }
    }
    pendingDrag = null;
    dragging = false;
  }
  document.addEventListener("mouseup", finishDrag, true);

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    const scrollKey = event.code === "Space"
      || event.key === "ArrowUp"
      || event.key === "ArrowDown"
      || event.key === "ArrowLeft"
      || event.key === "ArrowRight";
    if (scrollKey) event.preventDefault();
    if (!lastSelected) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const msg: ElementDeleteMessage = {
        type: "element-delete", protocolVersion: PROTOCOL_VERSION,
        cid: lastSelected.getAttribute("data-cid")!, src: lastSelected.getAttribute("data-src") ?? "",
        instanceIndex: instanceIndex(lastSelected), ...identity,
      };
      sendToParent(msg);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const msg: ElementNudgeMessage = {
      type: "element-nudge", protocolVersion: PROTOCOL_VERSION,
      cid: lastSelected.getAttribute("data-cid")!, src: lastSelected.getAttribute("data-src") ?? "",
      instanceIndex: instanceIndex(lastSelected), key: event.key, ...identity,
    };
    sendToParent(msg);
  }, true);

  document.addEventListener(
    "mouseout",
    (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const related = event.relatedTarget;
      if (related instanceof Node && (target.contains(related) || target === related)) return;

      const el = target.closest("[data-cid]");
      if (!(el instanceof HTMLElement)) return;

      if (related instanceof HTMLElement && related.closest("[data-cid]")) return;

      const cid = el.getAttribute("data-cid")!;
      const selector = buildSelector(el);
      const identity = getRendererIdentity();
      if (!identity) return;

      const msg: ElementHoverMessage = {
        type: "element-hover",
        protocolVersion: PROTOCOL_VERSION,
        cid,
        selector,
        rect: null,
        ...identity,
      };

      sendToParent(msg);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // Defer to navigation-intent when the user clicked a navigable same-origin
      // anchor that points to a different route. In canvas mode, anchor clicks
      // should create (or focus) a sibling card rather than selecting the anchor
      // itself. The navigation-intent listener is registered AFTER this one, so
      // we must NOT stop propagation here. Left to its own default the click would
      // perform a full-frame navigation inside the iframe; the navigation-intent
      // handler calls preventDefault once it has gathered the anchor href.
      const anchor = findClosestAnchor(target);
      if (anchor && isEligibleNavigation(anchor, event) && hasDifferentRoute(anchor)) {
        return;
      }

      const el = target.closest("[data-cid]");
      if (!(el instanceof HTMLElement)) return;
      lastSelected = el;

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
        file,
        line,
        component,
        ...identity,
      };

      sendToParent(msg);
    },
    true,
  );
}
