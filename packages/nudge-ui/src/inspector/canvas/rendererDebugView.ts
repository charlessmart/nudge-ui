import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";

const OUTLINES_ATTRIBUTE = "data-nudge-ui-debug-outlines";
const OUTLINES_STYLE_ID = "nudge-ui-debug-outlines";
const XRAY_CURSOR_STYLE_ID = "nudge-ui-debug-xray-cursor";

/** Depth between exploded layers, applied per DOM level. */
const XRAY_LAYER_GAP = 50;
const XRAY_MAX_DEPTH = 14;
const XRAY_MAX_ELEMENTS = 600;
const XRAY_DURATION_MS = 480;
const HOVER_OUTLINE_ID = "nudge-ui-debug-xray-hover";
const HOVER_OUTLINE_COLOR = "rgba(0, 150, 255, 0.9)";
const XRAY_LAYER_OUTLINE = "1px solid rgba(0, 150, 255, 0.55)";
const XRAY_LAYER_HOVER_OUTLINE = "2px solid rgba(0, 150, 255, 1)";
const XRAY_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const XRAY_ROOT_TRANSFORM = "rotateX(20deg) rotateY(20deg)";

const OUTLINE_COLOR = "rgba(0, 150, 255, 0.75)";
/** Text-level elements wrap runs of text rather than forming a box; a class suggests the author gave it a box. */
const TEXT_LEVEL = "strong, b, em, i, small, code, kbd, mark, abbr, sub, sup, u, s, q, cite, time, span:not([class]), a:not([class]), label:not([class])";

/** Draws a 1px outline on each box, leaving the page's own colors, fills and text as they are. */
function outlinesCss(): string {
  const scope = `html[${OUTLINES_ATTRIBUTE}] body`;
  const excluded = `:not(#${NUDGE_UI_MOUNT_ID}):not(#${HOVER_OUTLINE_ID})`;
  return `
${scope} *${excluded} {
  outline: 1px solid ${OUTLINE_COLOR} !important;
  outline-offset: -1px !important;
}
${scope} :is(${TEXT_LEVEL})${excluded} {
  outline: none !important;
}
`;
}

/** True when `element` is the inspector mount or lives inside it, across shadow roots. */
function isInspectorElement(element: Element, document: Document): boolean {
  const mount = document.getElementById(NUDGE_UI_MOUNT_ID);
  if (!mount) return false;
  let current: Element | null = element;
  while (current) {
    if (current === mount) return true;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}

type StyledElement = HTMLElement | SVGElement;

function isStyledElement(element: Element): element is StyledElement {
  return "style" in element && element.style instanceof CSSStyleDeclaration;
}

interface StyleBackup {
  readonly value: string;
  readonly priority: string;
  applied: string;
}

interface ElementBackup {
  readonly hadStyleAttribute: boolean;
  readonly properties: Map<string, StyleBackup>;
}

/**
 * Inline style overrides that can be put back exactly as the app left them.
 * A property the app rewrote meanwhile keeps the app's value.
 */
class InlineStyleOverrides {
  private readonly backups = new Map<StyledElement, ElementBackup>();

  set(element: StyledElement, property: string, value: string): void {
    let saved = this.backups.get(element);
    if (!saved) {
      saved = { hadStyleAttribute: element.hasAttribute("style"), properties: new Map() };
      this.backups.set(element, saved);
    }
    let backup = saved.properties.get(property);
    if (!backup) {
      backup = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
        applied: "",
      };
      saved.properties.set(property, backup);
    }
    element.style.setProperty(property, value, "important");
    backup.applied = element.style.getPropertyValue(property);
  }

  restore(element: StyledElement, property: string): void {
    const saved = this.backups.get(element);
    const backup = saved?.properties.get(property);
    if (!saved || !backup) return;
    restoreProperty(element, property, backup);
    saved.properties.delete(property);
  }

  /** Restores the named properties now, keeping every other override. */
  restoreProperties(properties: readonly string[]): void {
    for (const element of this.backups.keys()) {
      for (const property of properties) this.restore(element, property);
    }
  }

  restoreAll(): void {
    for (const [element, saved] of this.backups) {
      for (const [property, backup] of saved.properties) restoreProperty(element, property, backup);
      if (!saved.hadStyleAttribute && element.style.length === 0) element.removeAttribute("style");
    }
    this.backups.clear();
  }
}

function restoreProperty(element: StyledElement, property: string, backup: StyleBackup): void {
  const current = element.style.getPropertyValue(property);
  if (current !== backup.applied || element.style.getPropertyPriority(property) !== "important") return;
  if (backup.value) element.style.setProperty(property, backup.value, backup.priority);
  else element.style.removeProperty(property);
}

function countDescendants(element: Element, limit: number): number {
  let count = 0;
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode() && count < limit) count += 1;
  return count;
}

/**
 * Chooses the subtree to explode for the element under the pointer: the
 * nearest ancestor with enough layers to be worth showing, preferring a
 * smaller candidate over one that covers most of the viewport.
 */
export function chooseXrayRoot(target: Element, viewportArea: number): Element | null {
  const body = target.ownerDocument.body;
  let smaller: Element | null = null;
  for (let current: Element | null = target; current && current !== body && current !== body.parentElement; current = current.parentElement) {
    const descendants = countDescendants(current, 8);
    if (descendants < 2) continue;
    const rect = current.getBoundingClientRect();
    const large = rect.width * rect.height > viewportArea * 0.7;
    if (large && smaller) return smaller;
    if (descendants >= 4) return current;
    smaller ??= current;
  }
  return smaller;
}

interface XrayLayer {
  readonly element: StyledElement;
  readonly depth: number;
}

function collectXrayLayers(root: Element): XrayLayer[] {
  const layers: XrayLayer[] = [];
  const visit = (element: Element, depth: number): void => {
    if (layers.length >= XRAY_MAX_ELEMENTS || depth > XRAY_MAX_DEPTH) return;
    if (isStyledElement(element)) layers.push({ element, depth });
    // SVG content cannot take part in a 3D rendering context.
    if (element instanceof SVGElement) return;
    for (const child of element.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return layers;
}

export interface RendererDebugView {
  apply(state: DebugViewState): void;
  dispose(): void;
}

/** Applies the view tool's outlines and explode view to an application document. */
export function createRendererDebugView(
  document: Document = globalThis.document,
  /** Selects the element under a click on an exploded layer; false when nothing there can be selected. */
  onPick: (target: Element) => boolean = () => false,
  /** Called when the page starts or stops being pulled apart, so the controller can step its own chrome aside. */
  onExplodedChange: (exploded: boolean) => void = () => undefined,
): RendererDebugView {
  const window = document.defaultView;
  let state: DebugViewState = DEBUG_VIEW_OFF;

  // Outlines ---------------------------------------------------------------
  function applyOutlines(): void {
    const root = document.documentElement;
    const existing = document.getElementById(OUTLINES_STYLE_ID);
    if (!state.outlines) {
      root.removeAttribute(OUTLINES_ATTRIBUTE);
      existing?.remove();
      return;
    }
    if (!existing) {
      const style = document.createElement("style");
      style.id = OUTLINES_STYLE_ID;
      style.textContent = outlinesCss();
      (document.head ?? root).append(style);
    }
    root.setAttribute(OUTLINES_ATTRIBUTE, "");
  }

  // Explode view -----------------------------------------------------------
  type XrayPhase = "idle" | "exploded" | "collapsing";
  let phase: XrayPhase = "idle";

  /** Records the phase and tells the controller once the page is pulled apart or put back. */
  function setPhase(next: XrayPhase): void {
    const wasExploded = phase !== "idle";
    phase = next;
    if ((next !== "idle") !== wasExploded) onExplodedChange(next !== "idle");
  }
  let overrides = new InlineStyleOverrides();
  let explodedRect: DOMRect | null = null;
  let explodedRoot: Element | null = null;
  let hoverOutline: HTMLElement | null = null;
  let hoverTarget: Element | null = null;
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;
  let hoveredLayer: StyledElement | null = null;
  let outlinedLayers = new Set<StyledElement>();

  function hideHoverOutline(): void {
    hoverOutline?.remove();
    hoverOutline = null;
    hoverTarget = null;
  }

  /** Shows the hovered element's bounds, since the inspector's own hover overlay is off while the view tool is active. */
  function showHoverOutline(target: Element): void {
    if (target === hoverTarget && hoverOutline?.isConnected) return;
    hoverTarget = target;
    const rect = target.getBoundingClientRect();
    if (!hoverOutline) {
      hoverOutline = document.createElement("div");
      hoverOutline.id = HOVER_OUTLINE_ID;
      hoverOutline.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;border:1px solid ${HOVER_OUTLINE_COLOR};background:rgba(0, 150, 255, 0.08);`;
      (document.body ?? document.documentElement).append(hoverOutline);
    }
    hoverOutline.style.left = `${rect.left}px`;
    hoverOutline.style.top = `${rect.top}px`;
    hoverOutline.style.width = `${rect.width}px`;
    hoverOutline.style.height = `${rect.height}px`;
  }

  function explode(root: Element): void {
    if (!isStyledElement(root)) return;
    hideHoverOutline();
    const layers = collectXrayLayers(root);
    explodedRect = root.getBoundingClientRect();
    explodedRoot = root;
    const transition = `transform ${XRAY_DURATION_MS}ms ${XRAY_EASING}, translate ${XRAY_DURATION_MS}ms ${XRAY_EASING}`;
    for (const { element, depth } of layers) {
      overrides.set(element, "transition", transition);
      overrides.set(element, "transform-style", "preserve-3d");
      // Each of these flattens descendants out of the 3D rendering context.
      overrides.set(element, "overflow", "visible");
      overrides.set(element, "filter", "none");
      overrides.set(element, "backdrop-filter", "none");
      overrides.set(element, "clip-path", "none");
      overrides.set(element, "mask", "none");
      overrides.set(element, "contain", "none");
      overrides.set(element, "isolation", "auto");
      overrides.set(element, "mix-blend-mode", "normal");
      overrides.set(element, "will-change", "auto");
      if (depth > 0) {
        overrides.set(element, "outline", XRAY_LAYER_OUTLINE);
        outlinedLayers.add(element);
      }
    }
    if (getComputedStyle(root).position === "static") overrides.set(root, "position", "relative");
    overrides.set(root, "z-index", "2147483000");
    overrides.set(root, "transform-origin", "50% 50%");
    // Commit the starting state so the transforms below transition from it.
    void root.getBoundingClientRect();
    overrides.set(root, "transform", XRAY_ROOT_TRANSFORM);
    // Transforms compound through preserve-3d, so a constant gap per level
    // stacks each layer above its parent.
    for (const { element, depth } of layers) {
      if (depth > 0) overrides.set(element, "translate", `0 0 ${XRAY_LAYER_GAP}px`);
    }
    setPhase("exploded");
  }

  function finishCollapse(): void {
    hoveredLayer = null;
    outlinedLayers = new Set();
    clearTimeout(collapseTimer);
    collapseTimer = undefined;
    overrides.restoreAll();
    overrides = new InlineStyleOverrides();
    explodedRect = null;
    explodedRoot = null;
    setPhase("idle");
  }

  function collapse(animated: boolean): void {
    if (phase === "idle") return;
    if (!animated) {
      finishCollapse();
      return;
    }
    if (phase === "collapsing") return;
    setPhase("collapsing");
    // Animate back to the app's own transforms, then drop the remaining overrides.
    overrides.restoreProperties(["transform", "translate"]);
    collapseTimer = setTimeout(finishCollapse, XRAY_DURATION_MS);
  }

  function elementAt(point: { x: number; y: number }): Element | null {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target || isInspectorElement(target, document) || target.id === HOVER_OUTLINE_ID) return null;
    return target;
  }

  function explodeAt(point: { x: number; y: number }): void {
    const target = elementAt(point);
    if (!target) return;
    const viewportArea = (window?.innerWidth ?? 0) * (window?.innerHeight ?? 0);
    const root = chooseXrayRoot(target, viewportArea);
    if (root) explode(root);
  }

  function insideExplodedRect(point: { x: number; y: number }): boolean {
    if (!explodedRect) return false;
    const margin = 8;
    return point.x >= explodedRect.left - margin && point.x <= explodedRect.right + margin
      && point.y >= explodedRect.top - margin && point.y <= explodedRect.bottom + margin;
  }

  /** Thickens the outline of the exploded layer under the pointer; hit-testing already follows the 3D transform. */
  function highlightLayer(target: EventTarget | null): void {
    const next = target instanceof Element && isStyledElement(target) && !isInspectorElement(target, document) ? target : null;
    if (next === hoveredLayer) return;
    if (hoveredLayer && outlinedLayers.has(hoveredLayer)) overrides.set(hoveredLayer, "outline", XRAY_LAYER_OUTLINE);
    else if (hoveredLayer) overrides.restore(hoveredLayer, "outline");
    hoveredLayer = next;
    if (next && explodedRoot?.contains(next)) overrides.set(next, "outline", XRAY_LAYER_HOVER_OUTLINE);
    else hoveredLayer = null;
  }

  function onPointerMove(event: PointerEvent): void {
    if (phase === "exploded") {
      highlightLayer(event.target);
      return;
    }
    if (phase !== "idle") {
      hideHoverOutline();
      return;
    }
    const target = elementAt({ x: event.clientX, y: event.clientY });
    if (target) showHoverOutline(target);
    else hideHoverOutline();
  }

  function onPointerLeave(): void {
    hideHoverOutline();
  }

  /**
   * A click explodes the hovered subtree. Clicking a layer while exploded selects it and collapses back, staying in Explode view for the next click;
   * any other click while exploded just collapses it. Clicks during the collapse do nothing, so a click that
   * dismisses a group can't explode whatever sits under it.
   */
  function onClick(event: MouseEvent): void {
    const point = { x: event.clientX, y: event.clientY };
    if (phase === "idle") {
      if (!elementAt(point)) return;
      event.preventDefault();
      event.stopPropagation();
      explodeAt(point);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (phase === "collapsing") return;
    const target = event.target;
    if (insideExplodedRect(point) && target instanceof Element && explodedRoot?.contains(target)) onPick(target);
    collapse(true);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || phase === "idle") return;
    event.preventDefault();
    event.stopPropagation();
    collapse(true);
  }

  let xrayListening = false;

  /** Clicks inspect rather than edit or follow, so no element should show a text or pointer cursor. */
  function setXrayCursor(on: boolean): void {
    const existing = document.getElementById(XRAY_CURSOR_STYLE_ID);
    if (!on) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const style = document.createElement("style");
    style.id = XRAY_CURSOR_STYLE_ID;
    style.textContent = `html, html * { cursor: default !important; }`;
    (document.head ?? document.documentElement).append(style);
  }

  function applyXray(): void {
    if (state.xray === xrayListening) return;
    xrayListening = state.xray;
    setXrayCursor(state.xray);
    if (state.xray) {
      document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
      document.addEventListener("click", onClick, { capture: true });
      document.addEventListener("keydown", onKeyDown, { capture: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
      return;
    }
    document.removeEventListener("pointermove", onPointerMove, { capture: true });
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    hideHoverOutline();
    collapse(true);
  }

  function apply(next: DebugViewState): void {
    const previous = state;
    state = next;
    if (next.outlines !== previous.outlines) applyOutlines();
    if (next.xray !== previous.xray) applyXray();
  }

  return {
    apply,
    dispose() {
      apply(DEBUG_VIEW_OFF);
      collapse(false);
    },
  };
}
