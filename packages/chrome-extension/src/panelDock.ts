/** Extension-only panel docking; sets nudge-ui's `--panel-*` variables and targets its `.panel`, `.panel__header-row`, `.panel__restore`, `.locked-notice`, and collapse button. */
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
${LEFT} [data-test="collapse-inspector"] svg { transform: scaleX(-1); }
${LEFT} .panel__restore,
${LEFT} .locked-notice { right: auto; left: max(12px, env(safe-area-inset-left)); }

${DOCKED} ${DRAG_HANDLE_SELECTOR} { cursor: grab; }
${DOCKED} ${DRAG_HANDLE_SELECTOR} :is(${INTERACTIVE_SELECTOR}) { cursor: default; }
:host([${DRAGGING_ATTRIBUTE}]) * { cursor: grabbing !important; user-select: none !important; }
:host([${DRAGGING_ATTRIBUTE}]) .panel { box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(0, 0, 0, 0.18); }

.nudge-dock-target {
  position: fixed;
  top: var(--panel-inset);
  bottom: var(--panel-inset);
  z-index: 1;
  box-sizing: border-box;
  width: min(var(--panel-width), calc(100vw - 2 * var(--panel-inset)));
  border: 2px solid var(--accent);
  border-radius: var(--radius-12);
  background: var(--accent-surface);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease-out;
}
.nudge-dock-target[data-side="left"] { left: var(--panel-inset); }
.nudge-dock-target[data-side="right"] { right: var(--panel-inset); }
.nudge-dock-target[data-visible] { opacity: 1; }
`;

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
    let dropTarget: HTMLElement | null = null;
    let nextSide = side;

    const move = (event: PointerEvent): void => {
      if (event.pointerId !== down.pointerId) return;
      const offset = event.clientX - down.clientX;
      if (!dropTarget) {
        if (Math.abs(offset) < DRAG_THRESHOLD_PX) return;
        // Created per drag: React clears its container on mount, so a node kept there could vanish.
        dropTarget = document.createElement("div");
        dropTarget.className = "nudge-dock-target";
        shadow.append(dropTarget);
        host.setAttribute(DRAGGING_ATTRIBUTE, "");
      }
      // Keeps the page's hover handling, including nudge-ui's element highlight, out of the drag.
      event.preventDefault();
      event.stopPropagation();
      panel.style.transform = `translateX(${offset}px)`;
      nextSide = sideAt(event.clientX);
      dropTarget.dataset.side = nextSide;
      dropTarget.toggleAttribute("data-visible", nextSide !== side);
    };

    const end = (event: PointerEvent): void => {
      if (event.pointerId !== down.pointerId) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      if (!dropTarget) return;
      event.stopPropagation();
      // A release over the page would otherwise click, and select, the element under it.
      const swallowClick = (click: MouseEvent): void => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallowClick, true));
      dropTarget.remove();
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
