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

const HIT_SLOP = 6;
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

function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function paddingValues(element: HTMLElement): Record<PaddingSide, number> {
  const style = getElementComputedStyle(element);
  return {
    top: numberValue(style.paddingTop),
    right: numberValue(style.paddingRight),
    bottom: numberValue(style.paddingBottom),
    left: numberValue(style.paddingLeft),
  };
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

function borderValues(element: HTMLElement): Record<PaddingSide, number> {
  const style = getElementComputedStyle(element);
  return {
    top: numberValue(style.borderTopWidth),
    right: numberValue(style.borderRightWidth),
    bottom: numberValue(style.borderBottomWidth),
    left: numberValue(style.borderLeftWidth),
  };
}

function containsPoint(rect: BoxEdges, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function containsCross(value: number, start: number, end: number): boolean {
  return value >= start - HIT_SLOP && value <= end + HIT_SLOP;
}

function paddingAffordanceForSide(
  element: HTMLElement,
  side: PaddingSide,
  allowZero: boolean,
): SpacingAffordance | null {
  const outer = boxEdges(element);
  const padding = paddingValues(element);
  const borders = borderValues(element);
  const inner = {
    left: outer.left + borders.left,
    top: outer.top + borders.top,
    right: outer.right - borders.right,
    bottom: outer.bottom - borders.bottom,
  };
  const content = {
    left: inner.left + padding.left,
    top: inner.top + padding.top,
    right: inner.right - padding.right,
    bottom: inner.bottom - padding.bottom,
  };

  const value = padding[side];
  if (!allowZero && value <= EPSILON) return null;
  const candidate = (() => {
    switch (side) {
      case "top":
        return {
          axis: "horizontal" as const,
          dragAxis: "y" as const,
          guide: {
            left: inner.left,
            top: inner.top + value / 2 - 1,
            width: Math.max(0, inner.right - inner.left),
            height: 2,
          },
          hit: {
            left: inner.left,
            top: inner.top,
            width: Math.max(0, inner.right - inner.left),
            height: Math.max(0, content.top - inner.top),
          },
          direction: 1 as const,
        };
      case "right":
        return {
          axis: "vertical" as const,
          dragAxis: "x" as const,
          guide: {
            left: inner.right - value / 2 - 1,
            top: inner.top,
            width: 2,
            height: Math.max(0, inner.bottom - inner.top),
          },
          hit: {
            left: content.right,
            top: inner.top,
            width: Math.max(0, inner.right - content.right),
            height: Math.max(0, inner.bottom - inner.top),
          },
          direction: -1 as const,
        };
      case "bottom":
        return {
          axis: "horizontal" as const,
          dragAxis: "y" as const,
          guide: {
            left: inner.left,
            top: inner.bottom - value / 2 - 1,
            width: Math.max(0, inner.right - inner.left),
            height: 2,
          },
          hit: {
            left: inner.left,
            top: content.bottom,
            width: Math.max(0, inner.right - inner.left),
            height: Math.max(0, inner.bottom - content.bottom),
          },
          direction: -1 as const,
        };
      case "left":
        return {
          axis: "vertical" as const,
          dragAxis: "x" as const,
          guide: {
            left: inner.left + value / 2 - 1,
            top: inner.top,
            width: 2,
            height: Math.max(0, inner.bottom - inner.top),
          },
          hit: {
            left: inner.left,
            top: inner.top,
            width: Math.max(0, content.left - inner.left),
            height: Math.max(0, inner.bottom - inner.top),
          },
          direction: 1 as const,
        };
    }
  })();
  return {
    kind: "padding",
    property: `padding-${side}`,
    side,
    axis: candidate.axis,
    dragAxis: candidate.dragAxis,
    value,
    cursor: candidate.axis === "horizontal" ? "ns-resize" : "ew-resize",
    guide: candidate.guide,
    hit: candidate.hit,
    direction: candidate.direction,
    element,
  };
}

function paddingAffordanceAtPoint(
  element: HTMLElement,
  x: number,
  y: number,
  allowZero: boolean,
): SpacingAffordance | null {
  const outer = boxEdges(element);
  if (!containsPoint(outer, x, y)) return null;

  const padding = paddingValues(element);
  const borders = borderValues(element);
  const inner = {
    left: outer.left + borders.left,
    top: outer.top + borders.top,
    right: outer.right - borders.right,
    bottom: outer.bottom - borders.bottom,
  };
  const content = {
    left: inner.left + padding.left,
    top: inner.top + padding.top,
    right: inner.right - padding.right,
    bottom: inner.bottom - padding.bottom,
  };
  const sideRegions: Array<{ side: PaddingSide; inRegion: boolean }> = [
    {
      side: "top",
      inRegion: containsCross(x, inner.left, inner.right)
        && y >= inner.top - HIT_SLOP
        && y <= content.top + HIT_SLOP,
    },
    {
      side: "right",
      inRegion: containsCross(y, inner.top, inner.bottom)
        && x >= content.right - HIT_SLOP
        && x <= inner.right + HIT_SLOP,
    },
    {
      side: "bottom",
      inRegion: containsCross(x, inner.left, inner.right)
        && y >= content.bottom - HIT_SLOP
        && y <= inner.bottom + HIT_SLOP,
    },
    {
      side: "left",
      inRegion: containsCross(y, inner.top, inner.bottom)
        && x >= inner.left - HIT_SLOP
        && x <= content.left + HIT_SLOP,
    },
  ];
  const region = sideRegions.find(({ inRegion, side }) => inRegion
    && (allowZero || padding[side] > EPSILON));
  return region ? paddingAffordanceForSide(element, region.side, allowZero) : null;
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
    const next = byLeft
      .filter((right) => right.rect.left >= left.rect.right - EPSILON
        && overlap(left.rect.top, left.rect.bottom, right.rect.top, right.rect.bottom))
      .sort((a, b) => a.rect.left - b.rect.left)[0];
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
    const next = byTop
      .filter((bottom) => bottom.rect.top >= top.rect.bottom - EPSILON
        && overlap(top.rect.left, top.rect.right, bottom.rect.left, bottom.rect.right))
      .sort((a, b) => a.rect.top - b.rect.top)[0];
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

function gapDirection(element: HTMLElement, axis: SpacingAxis): 1 | -1 {
  const style = getElementComputedStyle(element);
  const direction = style.direction || "ltr";
  if (axis === "vertical") {
    return style.display === "flex" || style.display === "inline-flex"
      ? style.flexDirection === "column-reverse" ? -1 : 1
      : 1;
  }
  if (style.display === "flex" || style.display === "inline-flex") {
    const flexDirection = style.flexDirection || "row";
    const reverse = flexDirection === "row-reverse";
    return (reverse !== (direction === "rtl")) ? -1 : 1;
  }
  return direction === "rtl" ? -1 : 1;
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
    const main = segment.axis === "horizontal" ? x : y;
    const cross = segment.axis === "horizontal" ? y : x;
    return main >= segment.start - HIT_SLOP
      && main <= segment.end + HIT_SLOP
      && containsCross(cross, segment.crossStart, segment.crossEnd);
  });
  if (!candidate) return null;

  const value = gapValue(style, candidate.property);
  const midpoint = (candidate.start + candidate.end) / 2;
  const crossSize = Math.max(0, candidate.crossEnd - candidate.crossStart);
  const guide = candidate.axis === "horizontal"
    ? { left: midpoint - 1, top: candidate.crossStart, width: 2, height: crossSize }
    : { left: candidate.crossStart, top: midpoint - 1, width: crossSize, height: 2 };
  const hit = candidate.axis === "horizontal"
    ? {
        left: candidate.start,
        top: candidate.crossStart,
        width: Math.max(0, candidate.end - candidate.start),
        height: crossSize,
      }
    : {
        left: candidate.crossStart,
        top: candidate.start,
        width: crossSize,
        height: Math.max(0, candidate.end - candidate.start),
      };
  return {
    kind: "gap",
    property: candidate.property,
    side: null,
    axis: candidate.axis,
    dragAxis: candidate.axis === "horizontal" ? "x" : "y",
    value,
    cursor: candidate.axis === "horizontal" ? "ew-resize" : "ns-resize",
    guide,
    hit,
    direction: gapDirection(element, candidate.axis),
    element,
  };
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
  x?: number,
  y?: number,
): SpacingAffordance | null {
  if (descriptor.kind === "padding") {
    const side = descriptor.side;
    if (!side || descriptor.property !== `padding-${side}`) return null;
    if (x !== undefined && y !== undefined) {
      const affordance = paddingAffordanceAtPoint(element, x, y, true);
      if (affordance?.side !== side) return null;
    }
    return paddingAffordanceForSide(element, side, true);
  }
  if (descriptor.property !== "row-gap" && descriptor.property !== "column-gap") return null;
  if (x !== undefined && y !== undefined) return gapAffordanceAtPoint(element, x, y, descriptor.property);
  const segment = gapSegments(element).find((candidate) => candidate.property === descriptor.property);
  if (!segment) return null;
  return gapAffordanceAtPoint(
    element,
    segment.axis === "horizontal" ? (segment.start + segment.end) / 2 : segment.crossStart,
    segment.axis === "horizontal" ? segment.crossStart : (segment.start + segment.end) / 2,
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

export function toSpacingGuideData(affordance: SpacingAffordance): SpacingGuideData {
  return {
    kind: affordance.kind,
    property: affordance.property,
    side: affordance.side,
    axis: affordance.axis,
    dragAxis: affordance.dragAxis,
    value: affordance.value,
    direction: affordance.direction,
    cursor: affordance.cursor,
    guide: { ...affordance.guide },
    hit: { ...affordance.hit },
  };
}
