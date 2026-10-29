/** Extension-only panel docking; sets nudge-ui's `--panel-*` variables and targets its `.panel`, `.panel__resize`, `.panel__header-row`, `.panel__restore`, `.locked-notice`, and collapse button. */
import { INSPECTOR_ROOT_ID, PANEL_SIDE_WRITE_EVENT, type PanelSide } from "./protocol.ts";

const SIDE_ATTRIBUTE = "data-nudge-panel-side";
const DRAGGING_ATTRIBUTE = "data-nudge-panel-dragging";
/** Movement below this stays a click, so header buttons keep working. */
const DRAG_THRESHOLD_PX = 4;
const SNAP_DURATION_MS = 180;
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [role='button'], [contenteditable]";
const DRAG_HANDLE_SELECTOR = ".panel__header-row";

const DOCKED = `:host([${SIDE_ATTRIBUTE}])`;
const LEFT = `:host([${SIDE_ATTRIBUTE}="left"])`;

// `:host(...)` raises every selector above nudge-ui's own single-class rules, whatever order the sheets are adopted in.
const DOCK_CSS = `
${DOCKED} { --panel-inset: 8px; }
${LEFT} {
  --panel-reserve-start: calc(var(--panel-width) + var(--panel-inset));
  --panel-reserve-end: 0px;
}
${DOCKED} .panel {
  border-left: 0;
  border-radius: var(--radius-12);
  box-shadow: var(--shadow-popup);
}
${LEFT} .panel { inset: var(--panel-inset) auto var(--panel-inset) var(--panel-inset); }
${LEFT} .panel__resize { right: auto; left: calc(var(--panel-inset) + min(var(--panel-width), 100vw - 2 * var(--panel-inset)) - var(--space-4)); }
${LEFT} [data-test="collapse-inspector"] svg { transform: scaleX(-1); }
${LEFT} .panel__restore,
${LEFT} .locked-notice { right: auto; left: max(12px, env(safe-area-inset-left)); }

${DOCKED} ${DRAG_HANDLE_SELECTOR} { cursor: grab; }
${DOCKED} ${DRAG_HANDLE_SELECTOR} :is(${INTERACTIVE_SELECTOR}) { cursor: default; }
:host([${DRAGGING_ATTRIBUTE}]) * { cursor: grabbing !important; user-select: none !important; }
:host([${DRAGGING_ATTRIBUTE}]) .panel__resize { display: none; }
:host([${DRAGGING_ATTRIBUTE}]) .panel { box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(0, 0, 0, 0.18); }

.nudge-dock-target {
  position: fixed;
  top: var(--panel-inset);
  bottom: var(--panel-inset);
  z-index: 1;
  box-sizing: border-box;
  width: min(var(--panel-width), calc(100vw - 2 * var(--panel-inset)));
  border: 2px dashed var(--accent);
  border-radius: var(--radius-12);
  background: transparent;
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 120ms ease-out, background-color 120ms ease-out;
  @starting-style { opacity: 0; }
}
.nudge-dock-target[data-side="left"] { left: var(--panel-inset); }
.nudge-dock-target[data-side="right"] { right: var(--panel-inset); }
/* The side the panel will land on if let go now. */
.nudge-dock-target[data-active] { border-style: solid; background: var(--accent-surface); opacity: 1; }
`;

/**
 * Page-bound mouse and pointer events a panel drag keeps from the page, so the inspector's own hover outline and
 * padding and gap handles, and the page's hover effects, sit out the drag. The drag's own `pointermove`, `pointerup`
 * and `pointercancel` listeners share the window's capture phase, so stopping these never reaches them.
 */
const PAGE_POINTER_EVENTS = [
  "pointermove", "pointerover", "pointerout", "pointerenter", "pointerleave", "pointerup",
  "mousemove", "mouseover", "mouseout", "mouseenter", "mouseleave", "mouseup",
] as const;

function sideAt(clientX: number): PanelSide {
  return clientX < window.innerWidth / 2 ? "left" : "right";
}

/** Keeps the dock on every mount, since toggling the inspector replaces its root element. */
export function installPanelDock(initialSide: PanelSide): void {
  let side = initialSide;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(DOCK_CSS);
  const docked = new WeakSet<HTMLElement>();

  const dock = (host: HTMLElement): void => {
    if (docked.has(host)) return;
    docked.add(host);
    host.setAttribute(SIDE_ATTRIBUTE, side);
    // nudge-ui reuses an existing open shadow root rather than attaching its own.
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];

    shadow.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0 || !event.isPrimary) return;
      const target = event.composedPath()[0];
      if (!(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR)) return;
      const panel = target.closest<HTMLElement>(".panel");
      if (!panel || !target.closest(DRAG_HANDLE_SELECTOR)) return;
      startDrag(host, shadow, panel, event);
    });
  };

  const startDrag = (host: HTMLElement, shadow: ShadowRoot, panel: HTMLElement, down: PointerEvent): void => {
    let dropTargets: HTMLElement[] | null = null;
    let nextSide = side;

    const keepFromPage = (event: Event): void => event.stopPropagation();
    for (const type of PAGE_POINTER_EVENTS) window.addEventListener(type, keepFromPage, true);

    const move = (event: PointerEvent): void => {
      if (event.pointerId !== down.pointerId) return;
      const offset = event.clientX - down.clientX;
      if (!dropTargets) {
        if (Math.abs(offset) < DRAG_THRESHOLD_PX) return;
        // Both sides show from the start, so the user sees where the panel can go. Created per drag: React clears its
        // container on mount, so a node kept there could vanish.
        dropTargets = (["left", "right"] as const).map((targetSide) => {
          const target = document.createElement("div");
          target.className = "nudge-dock-target";
          target.dataset.side = targetSide;
          return target;
        });
        shadow.append(...dropTargets);
        host.setAttribute(DRAGGING_ATTRIBUTE, "");
      }
      event.preventDefault();
      panel.style.transform = `translateX(${offset}px)`;
      nextSide = sideAt(event.clientX);
      for (const target of dropTargets) target.toggleAttribute("data-active", target.dataset.side === nextSide);
    };

    const end = (event: PointerEvent): void => {
      if (event.pointerId !== down.pointerId) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      // The `mouseup` that follows this `pointerup` is still the drag's.
      setTimeout(() => {
        for (const type of PAGE_POINTER_EVENTS) window.removeEventListener(type, keepFromPage, true);
      });
      if (!dropTargets) return;
      // A release over the page would otherwise click, and select, the element under it.
      const swallowClick = (click: MouseEvent): void => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallowClick, true));
      for (const target of dropTargets) target.remove();
      host.removeAttribute(DRAGGING_ATTRIBUTE);
      if (event.type === "pointercancel") nextSide = side;
      // Animates from where the panel was let go to its docked place.
      const from = panel.getBoundingClientRect().left;
      panel.style.transform = "";
      if (nextSide !== side) {
        side = nextSide;
        host.setAttribute(SIDE_ATTRIBUTE, side);
        document.dispatchEvent(new CustomEvent(PANEL_SIDE_WRITE_EVENT, { detail: side }));
      }
      const to = panel.getBoundingClientRect().left;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      panel.animate(
        [{ transform: `translateX(${from - to}px)` }, { transform: "translateX(0)" }],
        { duration: SNAP_DURATION_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  };

  const findMount = (): void => {
    const host = document.getElementById(INSPECTOR_ROOT_ID);
    if (host) dock(host);
  };
  new MutationObserver(findMount).observe(document.body, { childList: true });
  findMount();
}
