export type Axis = "horizontal" | "vertical";
export type AxisAnchor = "start" | "end" | "stretch" | "none";

export interface AxisInsetValues {
  start: string;
  end: string;
}

export interface PositionInsetValues {
  horizontal: AxisInsetValues;
  vertical: AxisInsetValues;
}

export interface PositionAnchorState {
  horizontal: AxisAnchor;
  vertical: AxisAnchor;
}

export interface PositionDeclaration {
  property: "left" | "right" | "top" | "bottom";
  value: string;
}

const AUTO = "auto";

function isUnset(value: string): boolean {
  return !value.trim() || value.trim().toLowerCase() === AUTO;
}

export function axisAnchor(values: AxisInsetValues): AxisAnchor {
  const hasStart = !isUnset(values.start);
  const hasEnd = !isUnset(values.end);
  if (hasStart && hasEnd) return "stretch";
  if (hasStart) return "start";
  if (hasEnd) return "end";
  return "none";
}

export function positionAnchors(values: PositionInsetValues): PositionAnchorState {
  return {
    horizontal: axisAnchor(values.horizontal),
    vertical: axisAnchor(values.vertical),
  };
}

function axisProperties(axis: Axis): { start: PositionDeclaration["property"]; end: PositionDeclaration["property"] } {
  return axis === "horizontal"
    ? { start: "left", end: "right" }
    : { start: "top", end: "bottom" };
}

/**
 * Builds the physical declarations needed to switch an absolute-positioned
 * axis to a new anchor. Opposing sides are explicitly set to auto so a
 * previous inset cannot continue to constrain the box after the switch.
 */
export function anchorEditPlan(
  axis: Axis,
  target: Exclude<AxisAnchor, "none">,
  values: AxisInsetValues,
): PositionDeclaration[] {
  const properties = axisProperties(axis);
  const startValue = isUnset(values.start) ? "0px" : values.start.trim();
  const endValue = isUnset(values.end) ? "0px" : values.end.trim();
  const activeValue = startValue !== "0px" ? startValue : endValue;

  if (target === "start") {
    return [
      { property: properties.start, value: activeValue },
      { property: properties.end, value: AUTO },
    ];
  }
  if (target === "end") {
    return [
      { property: properties.start, value: AUTO },
      { property: properties.end, value: endValue === "0px" && startValue !== "0px" ? startValue : endValue },
    ];
  }

  return [
    { property: properties.start, value: startValue === "0px" ? activeValue : startValue },
    { property: properties.end, value: endValue === "0px" ? activeValue : endValue },
  ];
}

export function axisSide(axis: Axis, anchor: Exclude<AxisAnchor, "none">): PositionDeclaration["property"] {
  const properties = axisProperties(axis);
  return anchor === "end" ? properties.end : properties.start;
}

export function isActiveInset(value: string): boolean {
  return !isUnset(value);
}
