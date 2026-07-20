import { PROTOCOL_VERSION, sendToParent, type ElementHoverMessage, type ElementClickMessage } from "./frameProtocol.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";

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

export function installRendererElementSelector(): void {
  if (!import.meta.env.DEV) return;
  if (installed) return;
  installed = true;

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
      };

      sendToParent(msg);
    },
    true,
  );

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

      const msg: ElementHoverMessage = {
        type: "element-hover",
        protocolVersion: PROTOCOL_VERSION,
        cid,
        selector,
        rect: null,
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

      event.preventDefault();
      event.stopImmediatePropagation();

      const cid = el.getAttribute("data-cid")!;
      const selector = buildSelector(el);
      const { file, line, component, src } = getFiberInfo(el);

      const msg: ElementClickMessage = {
        type: "element-click",
        protocolVersion: PROTOCOL_VERSION,
        cid,
        selector,
        src,
        file,
        line,
        component,
      };

      sendToParent(msg);
    },
    true,
  );
}
