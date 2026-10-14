import type { StringArrayMap } from "./stringMaps.ts";

export const SPACING_SIDES: StringArrayMap = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};

/** CSS `gap` shorthand order: row gap, then column gap. */
export const GAP_AXES: StringArrayMap = {
  gap: ["row-gap", "column-gap"],
};

export const BORDER_RADIUS_CORNERS: StringArrayMap = {
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
};

/** Writing facts the integration reads from the selected element's computed style. */
export interface Directionality {
  direction: string;
  writingMode: string;
}

export function expandFourValueShorthand<T>(values: readonly T[]): [T, T, T, T] | null {
  if (values.length === 0 || values.length > 4) return null;
  const top = values[0]!;
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  if (values.length === 3) return [top, right, bottom, right];
  if (values.length === 2) return [top, right, top, right];
  return [top, right, bottom, left];
}

export function expandTwoValueShorthand<T>(values: readonly T[]): [T, T] | null {
  if (values.length === 0 || values.length > 2) return null;
  return values.length === 1 ? [values[0]!, values[0]!] : [values[0]!, values[1]!];
}

/** Maps logical margin/padding/inset properties to physical sides; null for non-logical properties. */
export function logicalPhysicalSides(property: string, directionality?: Directionality): string[] | null {
  const match = /^(margin|padding|inset)-(inline|block)(?:-(start|end))?$/.exec(property.toLowerCase());
  if (!match) return null;

  const [family, axis, edge] = [match[1]!, match[2]!, match[3]];
  const physicalPrefix = family === "inset" ? "" : `${family}-`;
  const direction = directionality?.direction || "ltr";
  const writingMode = directionality?.writingMode || "horizontal-tb";
  const vertical = writingMode.startsWith("vertical") || writingMode.startsWith("sideways");
  let sides: [string, string];

  if (!vertical) {
    sides = axis === "inline"
      ? direction === "rtl" ? [`${physicalPrefix}right`, `${physicalPrefix}left`] : [`${physicalPrefix}left`, `${physicalPrefix}right`]
      : [`${physicalPrefix}top`, `${physicalPrefix}bottom`];
  } else if (axis === "block") {
    sides = writingMode.includes("-rl")
      ? [`${physicalPrefix}right`, `${physicalPrefix}left`]
      : [`${physicalPrefix}left`, `${physicalPrefix}right`];
  } else {
    const ltrStartsAtBottom = writingMode === "sideways-lr";
    const startsAtBottom = direction === "rtl" ? !ltrStartsAtBottom : ltrStartsAtBottom;
    sides = startsAtBottom
      ? [`${physicalPrefix}bottom`, `${physicalPrefix}top`]
      : [`${physicalPrefix}top`, `${physicalPrefix}bottom`];
  }

  return edge ? [edge === "start" ? sides[0] : sides[1]] : sides;
}
