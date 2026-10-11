import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";

const OUTLINES_ATTRIBUTE = "data-nudge-ui-debug-outlines";
const OUTLINES_STYLE_ID = "nudge-ui-debug-outlines";

/** Depth between exploded layers, applied per DOM level. */
const XRAY_LAYER_GAP = 44;
const XRAY_MAX_DEPTH = 14;
const XRAY_MAX_ELEMENTS = 600;
const XRAY_DURATION_MS = 480;
const XRAY_DWELL_MS = 140;
const XRAY_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const XRAY_ROOT_TRANSFORM = "rotateX(50deg) rotateZ(-30deg) scale(0.85)";

const OUTLINE_INK = "#111";

function outlinesCss(): string {
  const scope = `html[${OUTLINES_ATTRIBUTE}] body`;
  const excluded = `:not(#${NUDGE_UI_MOUNT_ID})`;
  const elements = `${scope} *${excluded}`;
  return `
html[${OUTLINES_ATTRIBUTE}], ${scope} { background: #fff !important; }
${elements}, ${elements}::before, ${elements}::after {
  background-color: #fff !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  text-shadow: none !important;
  color: #fff !important;
  -webkit-text-stroke: 0.6px ${OUTLINE_INK} !important;
  caret-color: ${OUTLINE_INK} !important;
  outline: 1px solid ${OUTLINE_INK} !important;
  outline-offset: -1px !important;
  filter: none !important;
  backdrop-filter: none !important;
}
${scope} svg *${excluded} {
  outline: none !important;
  fill: #fff !important;
  stroke: ${OUTLINE_INK} !important;
}
${scope} :is(img, video, canvas, picture, iframe, object, embed)${excluded} {
  filter: grayscale(1) opacity(0.25) !important;
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
}

/** Inline style overrides that can be put back exactly as the app left them. */
class InlineStyleOverrides {
  private readonly backups = new Map<StyledElement, Map<string, StyleBackup>>();

  set(element: StyledElement, property: string, value: string): void {
    let saved = this.backups.get(element);
    if (!saved) {
      saved = new Map();
      this.backups.set(element, saved);
    }
    if (!saved.has(property)) {
      saved.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      });
    }
    element.style.setProperty(property, value, "important");
  }

  /** Restores the named properties now, keeping every other override. */
  restoreProperties(properties: readonly string[]): void {
    for (const [element, saved] of this.backups) {
      for (const property of properties) {
        const backup = saved.get(property);
        if (!backup) continue;
        element.style.setProperty(property, backup.value, backup.priority);
        saved.delete(property);
      }
    }
  }

  restoreAll(): void {
    for (const [element, saved] of this.backups) {
      for (const [property, backup] of saved) {
        if (backup.value) element.style.setProperty(property, backup.value, backup.priority);
        else element.style.removeProperty(property);
      }
    }
    this.backups.clear();
  }
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

/** Applies the Debug tool's views to an application document. */
export function createRendererDebugView(document: Document = globalThis.document): RendererDebugView {
  const window = document.defaultView;
  let state: DebugViewState = DEBUG_VIEW_OFF;

  // Timing -----------------------------------------------------------------
  // CSS animations, CSS transitions and Web Animations all surface through
  // getAnimations(), so a per-frame sweep catches each one as soon as it starts.
  let baseRates = new WeakMap<Animation, number>();
  let sweepFrame: number | null = null;

  function animations(): Animation[] {
    return typeof document.getAnimations === "function" ? document.getAnimations() : [];
  }

  function isInspectorAnimation(animation: Animation): boolean {
    const target = (animation.effect as Partial<KeyframeEffect> | null)?.target;
    return target instanceof Element && isInspectorElement(target, document);
  }

  function sweepAnimations(): void {
    const scale = state.timeScale;
    for (const animation of animations()) {
      if (isInspectorAnimation(animation)) continue;
      let base = baseRates.get(animation);
      if (base === undefined) {
        base = animation.playbackRate;
        baseRates.set(animation, base);
      }
      const rate = base / scale;
      if (animation.playbackRate !== rate) animation.playbackRate = rate;
    }
    sweepFrame = window?.requestAnimationFrame(sweepAnimations) ?? null;
  }

  function stopTiming(): void {
    if (sweepFrame !== null) window?.cancelAnimationFrame(sweepFrame);
    sweepFrame = null;
    for (const animation of animations()) {
      const base = baseRates.get(animation);
      if (base !== undefined) animation.playbackRate = base;
    }
    baseRates = new WeakMap();
  }

  function applyTiming(): void {
    if (state.timeScale === 1) {
      stopTiming();
      return;
    }
    if (sweepFrame !== null) window?.cancelAnimationFrame(sweepFrame);
    sweepAnimations();
  }

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

  // X-ray ------------------------------------------------------------------
  type XrayPhase = "idle" | "exploded" | "collapsing";
  let phase: XrayPhase = "idle";
  let overrides = new InlineStyleOverrides();
  let explodedRect: DOMRect | null = null;
  let lastPoint: { x: number; y: number } | null = null;
  let dwellTimer: ReturnType<typeof setTimeout> | undefined;
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;

  function explode(root: Element): void {
    if (!isStyledElement(root)) return;
    const layers = collectXrayLayers(root);
    explodedRect = root.getBoundingClientRect();
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
      if (depth > 0) overrides.set(element, "outline", "1px solid rgba(0, 150, 255, 0.55)");
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
    phase = "exploded";
  }

  function finishCollapse(): void {
    clearTimeout(collapseTimer);
    collapseTimer = undefined;
    overrides.restoreAll();
    overrides = new InlineStyleOverrides();
    explodedRect = null;
    phase = "idle";
  }

  function collapse(animated: boolean): void {
    clearTimeout(dwellTimer);
    if (phase === "idle") return;
    if (!animated) {
      finishCollapse();
      return;
    }
    if (phase === "collapsing") return;
    phase = "collapsing";
    // Animate back to the app's own transforms, then drop the remaining overrides.
    overrides.restoreProperties(["transform", "translate"]);
    collapseTimer = setTimeout(() => {
      finishCollapse();
      scheduleXray();
    }, XRAY_DURATION_MS);
  }

  function scheduleXray(): void {
    clearTimeout(dwellTimer);
    if (!state.xray || phase !== "idle" || !lastPoint) return;
    dwellTimer = setTimeout(() => {
      if (!state.xray || phase !== "idle" || !lastPoint) return;
      const target = document.elementFromPoint(lastPoint.x, lastPoint.y);
      if (!target || isInspectorElement(target, document)) return;
      const viewportArea = (window?.innerWidth ?? 0) * (window?.innerHeight ?? 0);
      const root = chooseXrayRoot(target, viewportArea);
      if (root) explode(root);
    }, XRAY_DWELL_MS);
  }

  function insideExplodedRect(point: { x: number; y: number }): boolean {
    if (!explodedRect) return false;
    const margin = 8;
    return point.x >= explodedRect.left - margin && point.x <= explodedRect.right + margin
      && point.y >= explodedRect.top - margin && point.y <= explodedRect.bottom + margin;
  }

  function onPointerMove(event: PointerEvent): void {
    lastPoint = { x: event.clientX, y: event.clientY };
    if (phase === "exploded") {
      if (!insideExplodedRect(lastPoint)) collapse(true);
      return;
    }
    if (phase === "idle") scheduleXray();
  }

  function onPointerLeave(): void {
    lastPoint = null;
    collapse(true);
  }

  let xrayListening = false;

  function applyXray(): void {
    if (state.xray === xrayListening) return;
    xrayListening = state.xray;
    if (state.xray) {
      document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
      return;
    }
    document.removeEventListener("pointermove", onPointerMove, { capture: true });
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    lastPoint = null;
    collapse(false);
  }

  return {
    apply(next) {
      const previous = state;
      state = next;
      if (next.timeScale !== previous.timeScale) applyTiming();
      if (next.outlines !== previous.outlines) applyOutlines();
      if (next.xray !== previous.xray) applyXray();
    },
    dispose() {
      this.apply(DEBUG_VIEW_OFF);
    },
  };
}
