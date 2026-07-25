export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MarginGuideSide = keyof Margins;

export interface MarginGuide {
  side: MarginGuideSide;
  axis: "horizontal" | "vertical";
  distance: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MarginFill {
  side: MarginGuideSide;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function toRect(domRect: DOMRect): Rect {
  return {
    left: domRect.left,
    top: domRect.top,
    width: domRect.width,
    height: domRect.height,
  };
}

function toPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readMargins(element: HTMLElement): Margins {
  const style = getComputedStyle(element);
  return {
    top: toPixels(style.marginTop),
    right: toPixels(style.marginRight),
    bottom: toPixels(style.marginBottom),
    left: toPixels(style.marginLeft),
  };
}

export function getMarginGuides(rect: Rect, margins: Margins): MarginGuide[] {
  const guides: MarginGuide[] = [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  if (Math.abs(margins.top) > 0.01) guides.push({ side: "top", axis: "horizontal", distance: margins.top, left: rect.left, top: rect.top - margins.top, width: rect.width, height: 0 });
  if (Math.abs(margins.right) > 0.01) guides.push({ side: "right", axis: "vertical", distance: margins.right, left: right + margins.right, top: rect.top, width: 0, height: rect.height });
  if (Math.abs(margins.bottom) > 0.01) guides.push({ side: "bottom", axis: "horizontal", distance: margins.bottom, left: rect.left, top: bottom + margins.bottom, width: rect.width, height: 0 });
  if (Math.abs(margins.left) > 0.01) guides.push({ side: "left", axis: "vertical", distance: margins.left, left: rect.left - margins.left, top: rect.top, width: 0, height: rect.height });

  return guides;
}

export function getMarginFills(rect: Rect, margins: Margins): MarginFill[] {
  const fills: MarginFill[] = [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  if (margins.top > 0.01) fills.push({ side: "top", left: rect.left, top: rect.top - margins.top, width: rect.width, height: margins.top });
  if (margins.right > 0.01) fills.push({ side: "right", left: right, top: rect.top, width: margins.right, height: rect.height });
  if (margins.bottom > 0.01) fills.push({ side: "bottom", left: rect.left, top: bottom, width: rect.width, height: margins.bottom });
  if (margins.left > 0.01) fills.push({ side: "left", left: rect.left - margins.left, top: rect.top, width: margins.left, height: rect.height });

  return fills;
}
