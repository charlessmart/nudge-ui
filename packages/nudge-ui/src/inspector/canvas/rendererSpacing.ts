import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";

/** Holds every spacing drawing, so page-wide styles such as the outlines view can leave it out. */
export const SPACING_LAYER_ID = "nudge-ui-debug-spacing";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
// The canvas's spacing fills: margin red, padding blue, gap pink.
const MARGIN_FILL = "rgb(239 68 68 / 14%)";
const PADDING_FILL = "rgb(59 130 246 / 14%)";
const GAP_FILL = "rgb(236 72 153 / 14%)";
/** A dense page gets its first elements marked rather than a frame that stutters. */
const MAX_SPACING_ELEMENTS = 2000;
/** Picks up elements the page adds or restyles without watching every mutation. */
const COLLECT_INTERVAL_MS = 500;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT", "TEMPLATE", "BR"]);

export interface BoxSides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface SpacingRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface SpacingSides {
  readonly margin: BoxSides;
  readonly padding: BoxSides;
  readonly border: BoxSides;
}

/** The space a flex or grid container leaves between its items, per axis. */
export interface ContainerGaps {
  readonly column: number;
  readonly row: number;
}

/** SVG path data for one box's margin, padding and gaps, drawn with the evenodd rule. */
export interface SpacingPaths {
  /** The ring between the margin edge and the border edge. */
  readonly margin: string;
  /** The ring between the border's inner edge and the padding edge. */
  readonly padding: string;
  /** The space between the box's flex or grid items. */
  readonly gap: string;
}

function rectPath(rect: SpacingRect): string {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return "";
  return `M${rect.left} ${rect.top}H${rect.right}V${rect.bottom}H${rect.left}Z`;
}

/** The area between two nested rectangles, or nothing when they match. */
function ringPath(outer: SpacingRect, inner: SpacingRect): string {
  const same = outer.left === inner.left && outer.top === inner.top && outer.right === inner.right && outer.bottom === inner.bottom;
  return same ? "" : `${rectPath(outer)}${rectPath(inner)}`;
}

/** Moves each edge of `rect` inward by its side; a negative side moves it outward. */
function insetRect(rect: SpacingRect, sides: BoxSides): SpacingRect {
  return {
    left: rect.left + sides.left,
    top: rect.top + sides.top,
    right: rect.right - sides.right,
    bottom: rect.bottom - sides.bottom,
  };
}

/** Negative margins pull neighbours in rather than leaving space, so they draw nothing. */
function outsetSides(sides: BoxSides): BoxSides {
  return {
    top: -Math.max(0, sides.top),
    right: -Math.max(0, sides.right),
    bottom: -Math.max(0, sides.bottom),
    left: -Math.max(0, sides.left),
  };
}

/** The margin and padding rings of a box whose border edge is `rect`. */
export function spacingPaths(rect: SpacingRect, sides: SpacingSides): Pick<SpacingPaths, "margin" | "padding"> {
  const borderInner = insetRect(rect, sides.border);
  return {
    margin: ringPath(insetRect(rect, outsetSides(sides.margin)), rect),
    padding: ringPath(borderInner, insetRect(borderInner, sides.padding)),
  };
}

/**
 * The gap between two items that sit next to each other in a flex or grid container, in either order, or null when
 * they do not. Items side by side are split by the column gap; items stacked one above the other by the row gap.
 */
export function gapBetween(first: SpacingRect, second: SpacingRect, gaps: ContainerGaps): SpacingRect | null {
  const top = Math.max(first.top, second.top);
  const bottom = Math.min(first.bottom, second.bottom);
  const left = Math.max(first.left, second.left);
  const right = Math.min(first.right, second.right);
  if (gaps.column > 0 && bottom > top) {
    // Reversed and wrapped rows can put the later item first.
    const [before, after] = first.right <= second.left ? [first, second] : [second, first];
    if (before.right <= after.left) return { left: before.right, top, right: after.left, bottom };
  }
  if (gaps.row > 0 && right > left) {
    const [above, below] = first.bottom <= second.top ? [first, second] : [second, first];
    if (above.bottom <= below.top) return { left, top: above.bottom, right, bottom: below.top };
  }
  return null;
}

/** The path covering every gap between consecutive item rectangles, in the order the items come. */
export function gapPath(items: readonly SpacingRect[], gaps: ContainerGaps): string {
  let path = "";
  for (let index = 1; index < items.length; index += 1) {
    const gap = gapBetween(items[index - 1]!, items[index]!, gaps);
    if (gap) path += rectPath(gap);
  }
  return path;
}

function offsetRect(rect: SpacingRect, origin: { readonly left: number; readonly top: number }): SpacingRect {
  return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
}

// Reading the page -------------------------------------------------------------

/** What a box spends on spacing, read once per collect rather than every frame. */
interface BoxSpacing {
  readonly sides: SpacingSides;
  readonly gaps: ContainerGaps | null;
  /** The in-flow children the gaps sit between; empty when the box has no gaps. */
  readonly items: readonly Element[];
}

function readSides(style: CSSStyleDeclaration, name: (side: keyof BoxSides) => string): BoxSides {
  const edge = (side: keyof BoxSides): number => Number.parseFloat(style.getPropertyValue(name(side))) || 0;
  return { top: edge("top"), right: edge("right"), bottom: edge("bottom"), left: edge("left") };
}

function readGaps(style: CSSStyleDeclaration): ContainerGaps | null {
  if (!/flex|grid/.test(style.display)) return null;
  const column = Number.parseFloat(style.columnGap) || 0;
  const row = Number.parseFloat(style.rowGap) || 0;
  return column > 0 || row > 0 ? { column, row } : null;
}

function readSpacing(view: Window, element: Element, style: CSSStyleDeclaration): BoxSpacing {
  const gaps = readGaps(style);
  return {
    sides: {
      margin: readSides(style, (side) => `margin-${side}`),
      padding: readSides(style, (side) => `padding-${side}`),
      border: readSides(style, (side) => `border-${side}-width`),
    },
    gaps,
    // Absolutely placed children sit outside the flow the gaps divide.
    items: gaps
      ? Array.from(element.children).filter((child) => !/^(absolute|fixed)$/.test(view.getComputedStyle(child).position))
      : [],
  };
}

function isDrawable(style: CSSStyleDeclaration): boolean {
  return style.display !== "none" && style.display !== "contents" && style.visibility !== "hidden";
}

function rectOf(element: Element): SpacingRect | null {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/** A box's spacing paths, with its own rectangle and its items' measured by `measure`. */
function boxPaths(rect: SpacingRect, spacing: BoxSpacing, measure: (element: Element) => SpacingRect | null): SpacingPaths {
  const { margin, padding } = spacingPaths(rect, spacing.sides);
  if (!spacing.gaps || spacing.items.length < 2) return { margin, padding, gap: "" };
  const items = spacing.items.map(measure).filter((item): item is SpacingRect => item !== null);
  return { margin, padding, gap: gapPath(items, spacing.gaps) };
}

// Drawing ----------------------------------------------------------------------

function createSvgNode<K extends "path" | "svg">(document: Document, tag: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

interface PathSet {
  readonly margin: SVGPathElement;
  readonly padding: SVGPathElement;
  readonly gap: SVGPathElement;
}

function createPathSet(document: Document, parent: SVGSVGElement): PathSet {
  const path = (fill: string): SVGPathElement => createSvgNode(document, "path", { fill, "fill-rule": "evenodd" });
  const set = { margin: path(MARGIN_FILL), padding: path(PADDING_FILL), gap: path(GAP_FILL) };
  parent.append(set.margin, set.padding, set.gap);
  return set;
}

/** Writes only what changed, since every frame repaints every box. */
function drawPaths(set: PathSet, paths: SpacingPaths | null): void {
  for (const kind of ["margin", "padding", "gap"] as const) {
    const data = paths?.[kind] ?? "";
    if (set[kind].getAttribute("d") !== data) set[kind].setAttribute("d", data);
  }
}

function setStyle(element: ElementCSSInlineStyle, property: "left" | "top" | "transform", value: string): void {
  if (element.style[property] !== value) element.style[property] = value;
}

interface SpacingEntry {
  element: Element | null;
  spacing: BoxSpacing | null;
  readonly paths: PathSet;
}

/** An exploded subtree: its root, and each element pulled apart with how many levels it sits below the root. */
export interface SpacingExplosion {
  readonly root: Element;
  readonly layers: readonly { readonly element: Element; readonly depth: number }[];
}

/**
 * The exploded subtree's spacing, measured flat before the explosion moves it, one plane of paths per depth. Paths are
 * relative to the root's border box.
 */
interface ExplosionSnapshot {
  readonly root: Element;
  readonly width: number;
  readonly height: number;
  /** A layer one level down, whose animated `translate` gives the current gap between planes. */
  readonly leadLayer: Element | null;
  readonly planes: ReadonlyMap<number, SpacingPaths>;
}

interface ExplosionPlanes {
  readonly snapshot: ExplosionSnapshot;
  readonly stage: HTMLDivElement;
  readonly planes: readonly { readonly depth: number; readonly svg: SVGSVGElement }[];
}

export interface RendererSpacingView {
  apply(on: boolean): void;
  /**
   * Called before an explosion moves its layers, while they still sit flat, and with null once they are back: the
   * exploded spacing is drawn on planes that follow the layers apart and back together.
   */
  explode(explosion: SpacingExplosion | null): void;
  dispose(): void;
}

/** Draws the margin, padding and gap of every visible element on the application document, in the canvas's spacing colors. */
export function createRendererSpacingView(document: Document = globalThis.document): RendererSpacingView {
  const view = document.defaultView;
  let running = false;
  let layer: HTMLDivElement | null = null;
  let pageSvg: SVGSVGElement | null = null;
  let entries: SpacingEntry[] = [];
  let snapshot: ExplosionSnapshot | null = null;
  let explosionPlanes: ExplosionPlanes | null = null;
  let frame: number | undefined;
  let collectTimer: ReturnType<typeof setInterval> | undefined;

  /** Adds the layer to the page if it is not there, and returns the SVG the page-wide boxes draw in. */
  function ensureLayer(): SVGSVGElement {
    if (layer?.isConnected && pageSvg) return pageSvg;
    layer = document.createElement("div");
    layer.id = SPACING_LAYER_ID;
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;overflow:visible;pointer-events:none;z-index:2147483646;";
    pageSvg = createSvgNode(document, "svg", { style: "position:absolute;inset:0;width:100%;height:100%;overflow:visible;" });
    layer.append(pageSvg);
    (document.body ?? document.documentElement).append(layer);
    return pageSvg;
  }

  function isOwnElement(element: Element, mount: Element | null): boolean {
    return element.namespaceURI !== XHTML_NAMESPACE
      || SKIPPED_TAGS.has(element.tagName)
      || element === layer
      || Boolean(layer?.contains(element))
      || Boolean(mount?.contains(element));
  }

  /** Re-reads which elements are on the page and their spacing, reusing the entries already drawn. */
  function collect(): void {
    if (!view) return;
    const svg = ensureLayer();
    const mount = document.getElementById(NUDGE_UI_MOUNT_ID);
    let count = 0;
    for (const element of document.body?.querySelectorAll("*") ?? []) {
      if (count >= MAX_SPACING_ELEMENTS) break;
      if (isOwnElement(element, mount)) continue;
      const style = view.getComputedStyle(element);
      if (!isDrawable(style)) continue;
      const entry = entries[count] ?? (entries[count] = { element: null, spacing: null, paths: createPathSet(document, svg) });
      entry.element = element;
      entry.spacing = readSpacing(view, element, style);
      count += 1;
    }
    for (const entry of entries.slice(count)) {
      entry.element = null;
      entry.spacing = null;
    }
  }

  /** The box's spacing in viewport coordinates, or null when it is gone, off screen, or drawn on an explosion plane. */
  function pagePaths(entry: SpacingEntry, viewportWidth: number, viewportHeight: number): SpacingPaths | null {
    const { element, spacing } = entry;
    if (!element?.isConnected || !spacing || snapshot?.root.contains(element)) return null;
    const rect = rectOf(element);
    if (!rect || rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight) return null;
    return boxPaths(rect, spacing, rectOf);
  }

  // Explosion ------------------------------------------------------------------

  function measureExplosion(explosion: SpacingExplosion): ExplosionSnapshot | null {
    if (!view) return null;
    const rootRect = explosion.root.getBoundingClientRect();
    const local = (element: Element): SpacingRect | null => {
      const rect = rectOf(element);
      return rect && offsetRect(rect, rootRect);
    };
    const planes = new Map<number, SpacingPaths>();
    for (const { element, depth } of explosion.layers) {
      const style = view.getComputedStyle(element);
      const rect = isDrawable(style) ? local(element) : null;
      if (!rect) continue;
      const paths = boxPaths(rect, readSpacing(view, element, style), local);
      const plane = planes.get(depth);
      planes.set(depth, plane
        ? { margin: plane.margin + paths.margin, padding: plane.padding + paths.padding, gap: plane.gap + paths.gap }
        : paths);
    }
    return {
      root: explosion.root,
      width: rootRect.width,
      height: rootRect.height,
      leadLayer: explosion.layers.find((layer) => layer.depth > 0)?.element ?? null,
      planes,
    };
  }

  /** A stage the size of the explosion root, carrying one plane per depth, that mirrors the root's 3D transform. */
  function buildExplosionPlanes(from: ExplosionSnapshot): ExplosionPlanes {
    const stage = document.createElement("div");
    stage.style.cssText = `position:absolute;width:${from.width}px;height:${from.height}px;transform-origin:50% 50%;transform-style:preserve-3d;`;
    const planes = Array.from(from.planes, ([depth, paths]) => {
      const svg = createSvgNode(document, "svg", { style: "position:absolute;inset:0;width:100%;height:100%;overflow:visible;" });
      drawPaths(createPathSet(document, svg), paths);
      stage.append(svg);
      return { depth, svg };
    });
    ensureLayer();
    layer?.append(stage);
    return { snapshot: from, stage, planes };
  }

  function clearExplosionPlanes(): void {
    explosionPlanes?.stage.remove();
    explosionPlanes = null;
  }

  /** Puts the planes where the exploded layers are now, following the explode and collapse transitions frame by frame. */
  function followExplosion(): void {
    if (!view || !explosionPlanes) return;
    const { snapshot: exploded, stage, planes } = explosionPlanes;
    // The root turns about its center, which the turn leaves in place.
    const rect = exploded.root.getBoundingClientRect();
    setStyle(stage, "left", `${(rect.left + rect.right - exploded.width) / 2}px`);
    setStyle(stage, "top", `${(rect.top + rect.bottom - exploded.height) / 2}px`);
    setStyle(stage, "transform", view.getComputedStyle(exploded.root).transform);
    const leadTranslate = exploded.leadLayer ? view.getComputedStyle(exploded.leadLayer).translate : "";
    const layerGap = Number.parseFloat(leadTranslate.split(" ")[2] ?? "") || 0;
    for (const { depth, svg } of planes) setStyle(svg, "transform", `translateZ(${depth * layerGap}px)`);
  }

  // Lifecycle ------------------------------------------------------------------

  function tick(): void {
    const width = view?.innerWidth ?? 0;
    const height = view?.innerHeight ?? 0;
    for (const entry of entries) drawPaths(entry.paths, pagePaths(entry, width, height));
    followExplosion();
    frame = view?.requestAnimationFrame(tick);
  }

  function start(): void {
    collect();
    if (snapshot) explosionPlanes = buildExplosionPlanes(snapshot);
    collectTimer = setInterval(collect, COLLECT_INTERVAL_MS);
    frame = view?.requestAnimationFrame(tick);
  }

  function stop(): void {
    clearInterval(collectTimer);
    collectTimer = undefined;
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
    explosionPlanes = null;
    layer?.remove();
    layer = null;
    pageSvg = null;
    entries = [];
  }

  return {
    apply(on) {
      if (on === running) return;
      running = on;
      if (on) start();
      else stop();
    },
    explode(explosion) {
      // Measured even while the view is off, since the layers only sit flat until the explosion starts.
      snapshot = explosion ? measureExplosion(explosion) : null;
      clearExplosionPlanes();
      if (running && snapshot) explosionPlanes = buildExplosionPlanes(snapshot);
    },
    dispose() {
      running = false;
      snapshot = null;
      stop();
    },
  };
}
