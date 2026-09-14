import type { BorderWidths, Rect } from "./overlayGeometry.ts";

export type MeasurementAxis = "horizontal" | "vertical";

export interface MeasurementSegment {
  id: string;
  kind: "ruler" | "projection";
  axis: MeasurementAxis;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** A ruler has a visible, rounded pixel label; projections do not. */
  distance?: number;
}

export interface MeasurementGeometry {
  segments: MeasurementSegment[];
}

export interface MeasurementGeometryOptions {
  selectedBorders?: BorderWidths;
  hoveredBorders?: BorderWidths;
}

interface AxisBounds {
  min: number;
  max: number;
}

interface AxisRuler {
  selectedEdge: number;
  hoveredEdge: number;
}

const EPSILON = 0.01;

function bounds(rect: Rect, axis: MeasurementAxis): AxisBounds {
  return axis === "horizontal"
    ? { min: rect.left, max: rect.left + rect.width }
    : { min: rect.top, max: rect.top + rect.height };
}

function innerBounds(rect: Rect, borders: BorderWidths | undefined, axis: MeasurementAxis): AxisBounds {
  const outer = bounds(rect, axis);
  if (!borders) return outer;
  return axis === "horizontal"
    ? { min: outer.min + borders.left, max: outer.max - borders.right }
    : { min: outer.min + borders.top, max: outer.max - borders.bottom };
}

function center(rect: Rect, axis: MeasurementAxis): number {
  const range = bounds(rect, axis);
  return (range.min + range.max) / 2;
}

function centerFromBounds(range: AxisBounds): number {
  return (range.min + range.max) / 2;
}

function hasLength(from: number, to: number): boolean {
  return Math.abs(to - from) > EPSILON;
}

/**
 * Finds the labelled ruler(s) for one axis. A positive gap gets a single
 * nearest-edge ruler. On overlap, the measurement changes to the hovered
 * element's far edge; containment has two meaningful inset measurements.
 */
function getAxisRulers(
  selected: AxisBounds,
  hovered: AxisBounds,
  selectedInner: AxisBounds,
  hoveredInner: AxisBounds,
): AxisRuler[] {
  if (selected.max < hovered.min - EPSILON) {
    return [{ selectedEdge: selected.max, hoveredEdge: hovered.min }];
  }
  if (hovered.max < selected.min - EPSILON) {
    return [{ selectedEdge: selected.min, hoveredEdge: hovered.max }];
  }

  const selectedContainsHovered = selected.min <= hovered.min + EPSILON
    && selected.max >= hovered.max - EPSILON;
  const hoveredContainsSelected = hovered.min <= selected.min + EPSILON
    && hovered.max >= selected.max - EPSILON;

  if (selectedContainsHovered && hoveredContainsSelected) {
    return [
      { selectedEdge: selected.min, hoveredEdge: hovered.min },
      { selectedEdge: selected.max, hoveredEdge: hovered.max },
    ].filter((ruler) => hasLength(ruler.selectedEdge, ruler.hoveredEdge));
  }
  if (selectedContainsHovered) {
    return [
      { selectedEdge: selectedInner.min, hoveredEdge: hovered.min },
      { selectedEdge: selectedInner.max, hoveredEdge: hovered.max },
    ].filter((ruler) => hasLength(ruler.selectedEdge, ruler.hoveredEdge));
  }
  if (hoveredContainsSelected) {
    return [
      { selectedEdge: selected.min, hoveredEdge: hoveredInner.min },
      { selectedEdge: selected.max, hoveredEdge: hoveredInner.max },
    ].filter((ruler) => hasLength(ruler.selectedEdge, ruler.hoveredEdge));
  }

  // The boxes partially overlap. Measure from the selected outside edge to
  // the hover's far edge rather than rendering a zero or negative gap.
  if (centerFromBounds(selected) >= centerFromBounds(hovered)) {
    return [{ selectedEdge: selected.min, hoveredEdge: hovered.min }];
  }
  return [{ selectedEdge: selected.max, hoveredEdge: hovered.max }];
}

function createSegment(
  id: string,
  kind: MeasurementSegment["kind"],
  axis: MeasurementAxis,
  from: number,
  to: number,
  cross: number,
): MeasurementSegment {
  const horizontal = axis === "horizontal";
  return {
    id,
    kind,
    axis,
    from: horizontal ? { x: from, y: cross } : { x: cross, y: from },
    to: horizontal ? { x: to, y: cross } : { x: cross, y: to },
    ...(kind === "ruler" ? { distance: Math.abs(to - from) } : {}),
  };
}

/**
 * Solid rulers always run through the selected element's centerline. If the
 * centerline does not meet the hovered edge, a perpendicular dotted extension
 * starts at that hovered edge and joins the ruler.
 */
function appendPrimaryRulers(
  segments: MeasurementSegment[],
  selected: Rect,
  hovered: Rect,
  axis: MeasurementAxis,
  options: MeasurementGeometryOptions,
): void {
  const crossAxis = axis === "horizontal" ? "vertical" : "horizontal";
  const cross = center(selected, crossAxis);
  const hoveredCross = bounds(hovered, crossAxis);
  const rulers = getAxisRulers(
    bounds(selected, axis),
    bounds(hovered, axis),
    innerBounds(selected, options.selectedBorders, axis),
    innerBounds(hovered, options.hoveredBorders, axis),
  );

  rulers.forEach((ruler, index) => {
    segments.push(createSegment(
      `primary-${axis}-${index}`,
      "ruler",
      axis,
      ruler.selectedEdge,
      ruler.hoveredEdge,
      cross,
    ));

    const hoveredNearestCrossEdge = cross < hoveredCross.min - EPSILON
      ? hoveredCross.min
      : cross > hoveredCross.max + EPSILON
        ? hoveredCross.max
        : null;
    if (hoveredNearestCrossEdge === null || !hasLength(hoveredNearestCrossEdge, cross)) return;

    segments.push(createSegment(
      `projection-${axis}-${index}`,
      "projection",
      crossAxis,
      hoveredNearestCrossEdge,
      cross,
      ruler.hoveredEdge,
    ));
  });
}

export function getMeasurementGeometry(
  selected: Rect,
  hovered: Rect,
  options: MeasurementGeometryOptions = {},
): MeasurementGeometry {
  const segments: MeasurementSegment[] = [];
  appendPrimaryRulers(segments, selected, hovered, "horizontal", options);
  appendPrimaryRulers(segments, selected, hovered, "vertical", options);
  return { segments };
}
