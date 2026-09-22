import { getElementComputedStyle } from "../runtime/domRealm.ts";
import type { Rect } from "./overlayGeometry.ts";

export type PaddingSide = "top" | "right" | "bottom" | "left";
export type SpacingKind = "padding" | "gap";
export type SpacingAxis = "horizontal" | "vertical";
export type SpacingDragAxis = "x" | "y";
export type SpacingProperty = `padding-${PaddingSide}` | "row-gap" | "column-gap";

export interface SpacingGuideData {
  kind: SpacingKind;
  property: SpacingProperty;
  side: PaddingSide | null;
  axis: SpacingAxis;
  dragAxis: SpacingDragAxis;
  value: number;
  direction: 1 | -1;
  cursor: "ew-resize" | "ns-resize";
  guide: Rect;
  affectedGuides: Rect[];
  affectedAreas: Rect[];
  /** A 24px-thick pointer target centred on the visible, up-to-40px guide handle. */
  hit: Rect;
}

export interface SpacingAffordance extends SpacingGuideData {
  element: HTMLElement;
}

export interface SpacingDescriptor {
  kind: SpacingKind;
  property: SpacingProperty;
  side: PaddingSide | null;
}

interface BoxEdges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LayoutChild {
  element: HTMLElement;
  rect: BoxEdges;
}

interface GapSegment {
  property: "row-gap" | "column-gap";
  axis: SpacingAxis;
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
}

const SPACING_DRAG_TARGET_SIZE = 24;
export const SPACING_GUIDE_HANDLE_LENGTH = 40;
const EPSILON = 0.01;

function rightOf(rect: DOMRect): number {
  return Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
}

function bottomOf(rect: DOMRect): number {
  return Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
}

function boxEdges(element: HTMLElement): BoxEdges {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rightOf(rect),
    bottom: bottomOf(rect),
  };
}

// Computed style resolves to px in browsers, so drag math normalizes to px.
// An authored rem/% is intentionally rewritten as px on commit.
function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

interface BoxModel {
  outer: BoxEdges;
  inner: BoxEdges;
  content: BoxEdges;
  padding: Record<PaddingSide, number>;
}

function boxModel(element: HTMLElement): BoxModel {
  const style = getElementComputedStyle(element);
  const padding: Record<PaddingSide, number> = {
    top: numberValue(style.paddingTop),
    right: numberValue(style.paddingRight),
    bottom: numberValue(style.paddingBottom),
    left: numberValue(style.paddingLeft),
  };
  const border = {
    top: numberValue(style.borderTopWidth),
    right: numberValue(style.borderRightWidth),
    bottom: numberValue(style.borderBottomWidth),
    left: numberValue(style.borderLeftWidth),
  };
  const outer = boxEdges(element);
  const inner = {
    left: outer.left + border.left,
    top: outer.top + border.top,
    right: outer.right - border.right,
    bottom: outer.bottom - border.bottom,
  };
  const content = {
    left: inner.left + padding.left,
    top: inner.top + padding.top,
    right: inner.right - padding.right,
    bottom: inner.bottom - padding.bottom,
  };
  return { outer, inner, content, padding };
}

function containsPoint(rect: BoxEdges, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function containsRectPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left
    && x <= rect.left + rect.width
    && y >= rect.top
    && y <= rect.top + rect.height;
}

function guideHit(guide: Rect, orientation: SpacingAxis): Rect {
  if (orientation === "horizontal") {
    const height = Math.max(SPACING_DRAG_TARGET_SIZE, guide.height);
    const width = Math.min(SPACING_GUIDE_HANDLE_LENGTH, guide.width);
    return {
      left: guide.left + (guide.width - width) / 2,
      top: guide.top - (height - guide.height) / 2,
      width,
      height,
    };
  }
  const width = Math.max(SPACING_DRAG_TARGET_SIZE, guide.width);
  const height = Math.min(SPACING_GUIDE_HANDLE_LENGTH, guide.height);
  return {
    left: guide.left - (width - guide.width) / 2,
    top: guide.top + (guide.height - height) / 2,
    width,
    height,
  };
}

const PADDING_CONFIG = {
  top: { axis: "horizontal", dragAxis: "y", direction: 1 },
  right: { axis: "vertical", dragAxis: "x", direction: 1 },
  bottom: { axis: "horizontal", dragAxis: "y", direction: 1 },
  left: { axis: "vertical", dragAxis: "x", direction: 1 },
} as const satisfies Record<PaddingSide, { axis: SpacingAxis; dragAxis: SpacingDragAxis; direction: 1 | -1 }>;

function paddingAffordanceForSide(
  element: HTMLElement,
  side: PaddingSide,
  allowZero: boolean,
  model = boxModel(element),
): SpacingAffordance | null {
  const { inner, content, padding } = model;
  const value = padding[side];
  if (!allowZero && value <= EPSILON) return null;
  const config = PADDING_CONFIG[side];
  const width = Math.max(0, inner.right - inner.left);
  const height = Math.max(0, inner.bottom - inner.top);
  const guide: Rect = config.axis === "horizontal"
    ? {
      left: inner.left,
      top: (side === "top" ? inner.top + value / 2 : inner.bottom - value / 2) - 1,
      width,
      height: 2,
    }
    : {
      left: (side === "left" ? inner.left + value / 2 : inner.right - value / 2) - 1,
      top: inner.top,
      width: 2,
      height,
    };
  const area: Rect = config.axis === "horizontal"
    ? {
      left: inner.left,
      top: side === "top" ? inner.top : content.bottom,
      width,
      height: Math.max(0, (side === "top" ? content.top : inner.bottom) - (side === "top" ? inner.top : content.bottom)),
    }
    : {
      left: side === "left" ? inner.left : content.right,
      top: inner.top,
      width: Math.max(0, (side === "left" ? content.left : inner.right) - (side === "left" ? inner.left : content.right)),
      height,
    };
  const hit = guideHit(guide, config.axis);
  return {
    kind: "padding",
    property: `padding-${side}`,
    side,
    axis: config.axis,
    dragAxis: config.dragAxis,
    value,
    cursor: config.axis === "horizontal" ? "ns-resize" : "ew-resize",
    guide,
    affectedGuides: [guide],
    affectedAreas: [area],
    hit,
    direction: config.direction,
    element,
  };
}

function paddingAffordanceAtPoint(
  element: HTMLElement,
  x: number,
  y: number,
  allowZero: boolean,
): SpacingAffordance | null {
  const model = boxModel(element);
  if (!containsPoint(model.outer, x, y)) return null;
  const sides: PaddingSide[] = ["top", "right", "bottom", "left"];
  for (const side of sides) {
    const affordance = paddingAffordanceForSide(element, side, allowZero, model);
    if (affordance && containsRectPoint(affordance.hit, x, y)) return affordance;
  }
  return null;
}

function overlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > EPSILON;
}

function layoutChildren(element: HTMLElement): LayoutChild[] {
  const HTMLElementConstructor = element.ownerDocument.defaultView?.HTMLElement;
  if (!HTMLElementConstructor) return [];
  return Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElementConstructor)
    .map((child) => ({ element: child, rect: boxEdges(child) }));
}

function gapSegments(element: HTMLElement): GapSegment[] {
  const style = getElementComputedStyle(element);
  if (style.display !== "flex"
    && style.display !== "inline-flex"
    && style.display !== "grid"
    && style.display !== "inline-grid") return [];

  const children = layoutChildren(element);
  const segments: GapSegment[] = [];
  const byLeft = [...children].sort((left, right) => left.rect.left - right.rect.left);
  const byTop = [...children].sort((top, bottom) => top.rect.top - bottom.rect.top);

  for (const left of byLeft) {
    const next = byLeft.find((right) => right.rect.left >= left.rect.right - EPSILON
      && overlap(left.rect.top, left.rect.bottom, right.rect.top, right.rect.bottom));
    if (!next) continue;
    segments.push({
      property: "column-gap",
      axis: "horizontal",
      start: left.rect.right,
      end: next.rect.left,
      crossStart: Math.max(left.rect.top, next.rect.top),
      crossEnd: Math.min(left.rect.bottom, next.rect.bottom),
    });
  }

  for (const top of byTop) {
    const next = byTop.find((bottom) => bottom.rect.top >= top.rect.bottom - EPSILON
      && overlap(top.rect.left, top.rect.right, bottom.rect.left, bottom.rect.right));
    if (!next) continue;
    segments.push({
      property: "row-gap",
      axis: "vertical",
      start: top.rect.bottom,
      end: next.rect.top,
      crossStart: Math.max(top.rect.left, next.rect.left),
      crossEnd: Math.min(top.rect.right, next.rect.right),
    });
  }

  return segments;
}

function gapAffordanceAtPoint(
  element: HTMLElement,
  x: number,
  y: number,
  property?: "row-gap" | "column-gap",
): SpacingAffordance | null {
  const segments = gapSegments(element);
  if (segments.length === 0) return null;
  const style = getElementComputedStyle(element);
  const candidate = segments.find((segment) => {
    if (property && segment.property !== property) return false;
    return containsRectPoint(gapDragHit(segment), x, y);
  });
  if (!candidate) return null;

  const value = gapValue(style, candidate.property);
  const guide = gapGuide(candidate);
  const matchingSegments = segments.filter((segment) => segment.property === candidate.property);
  const hit = gapDragHit(candidate);
  return {
    kind: "gap",
    property: candidate.property,
    side: null,
    axis: candidate.axis,
    dragAxis: candidate.axis === "horizontal" ? "x" : "y",
    value,
    cursor: candidate.axis === "horizontal" ? "ew-resize" : "ns-resize",
    guide,
    affectedGuides: matchingSegments.map(gapGuide),
    affectedAreas: matchingSegments.map(gapArea),
    hit,
    // Gap size is absolute screen space; dragging along +axis always grows it.
    direction: 1,
    element,
  };
}

function gapGuide(segment: GapSegment): Rect {
  const midpoint = (segment.start + segment.end) / 2;
  const crossSize = Math.max(0, segment.crossEnd - segment.crossStart);
  return segment.axis === "horizontal"
    ? { left: midpoint - 1, top: segment.crossStart, width: 2, height: crossSize }
    : { left: segment.crossStart, top: midpoint - 1, width: crossSize, height: 2 };
}

function gapArea(segment: GapSegment): Rect {
  const crossSize = Math.max(0, segment.crossEnd - segment.crossStart);
  return segment.axis === "horizontal"
    ? {
      left: segment.start,
      top: segment.crossStart,
      width: Math.max(0, segment.end - segment.start),
      height: crossSize,
    }
    : {
      left: segment.crossStart,
      top: segment.start,
      width: crossSize,
      height: Math.max(0, segment.end - segment.start),
    };
}

function gapDragHit(segment: GapSegment): Rect {
  const orientation: SpacingAxis = segment.axis === "horizontal" ? "vertical" : "horizontal";
  return guideHit(gapGuide(segment), orientation);
}

function gapValue(style: CSSStyleDeclaration, property: "row-gap" | "column-gap"): number {
  const direct = style.getPropertyValue(property)
    || (property === "row-gap" ? style.rowGap : style.columnGap);
  if (direct.trim()) return numberValue(direct);

  // jsdom and a few older browser CSSOM implementations expose `gap` but not
  // the longhands through getPropertyValue(). Keep the gesture model aligned
  // with the browser's shorthand fallback in those realms.
  const shorthand = style.getPropertyValue("gap") || style.gap;
  const values = shorthand.trim().split(/\s+/).filter(Boolean);
  if (values.length === 0) return 0;
  if (values.length === 1) return numberValue(values[0]!);
  return numberValue(property === "row-gap" ? values[0]! : values[1]!);
}

function trackedElementsAtPoint(doc: Document, x: number, y: number): HTMLElement[] {
  if (typeof doc.elementFromPoint !== "function") return [];
  const target = doc.elementFromPoint(x, y);
  if (!target) return [];
  const HTMLElementConstructor = doc.defaultView?.HTMLElement;
  if (!HTMLElementConstructor) return [];
  const result: HTMLElement[] = [];
  let element: Element | null = target;
  while (element) {
    if (element instanceof HTMLElementConstructor && element.hasAttribute("data-cid")) {
      result.push(element);
    }
    element = element.parentElement;
  }
  return result;
}

/** Finds the spacing target under a document-local pointer location. */
export function getSpacingAffordanceAtPoint(doc: Document, x: number, y: number): SpacingAffordance | null {
  const candidates = trackedElementsAtPoint(doc, x, y);
  for (const element of candidates) {
    const padding = paddingAffordanceAtPoint(element, x, y, false);
    if (padding) return padding;
  }
  for (const element of candidates) {
    const gap = gapAffordanceAtPoint(element, x, y);
    if (gap) return gap;
  }
  // A zero-sized padding region still needs a small draggable edge so users
  // can establish padding without first typing a value in the inspector.
  for (const element of candidates) {
    const padding = paddingAffordanceAtPoint(element, x, y, true);
    if (padding) return padding;
  }
  return null;
}

/** Re-resolves a renderer-reported spacing descriptor in its owner document. */
export function getSpacingAffordanceForDescriptor(
  element: HTMLElement,
  descriptor: SpacingDescriptor,
): SpacingAffordance | null {
  if (descriptor.kind === "padding") {
    const side = descriptor.side;
    if (!side || descriptor.property !== `padding-${side}`) return null;
    return paddingAffordanceForSide(element, side, true);
  }
  if (descriptor.property !== "row-gap" && descriptor.property !== "column-gap") return null;
  const segment = gapSegments(element).find((candidate) => candidate.property === descriptor.property);
  if (!segment) return null;
  const guide = gapGuide(segment);
  return gapAffordanceAtPoint(
    element,
    guide.left + guide.width / 2,
    guide.top + guide.height / 2,
    descriptor.property,
  );
}

/** Calculates the pixel value represented by a direct-manipulation drag. */
export function spacingValueForDrag(
  affordance: Pick<SpacingAffordance, "dragAxis" | "direction" | "value">,
  start: { x: number; y: number },
  point: { x: number; y: number },
): number {
  const delta = affordance.dragAxis === "x" ? point.x - start.x : point.y - start.y;
  return Math.max(0, Math.round(affordance.value + delta * affordance.direction));
}

export function spacingValueCss(value: number): string {
  return `${Math.max(0, Math.round(value))}px`;
}

/** Serializes the stable part of an affordance for renderer-to-controller messages. */
export function toSpacingDescriptor(affordance: SpacingAffordance): SpacingDescriptor {
  return {
    kind: affordance.kind,
    property: affordance.property,
    side: affordance.side,
  };
}
