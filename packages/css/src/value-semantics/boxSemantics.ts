/**
 * Box and spacing value semantics (plan slice 3.5).
 *
 * One browser-safe Module owns physical and logical box-value expansion:
 * 1–4 value shorthand expansion for `margin`/`padding`/`inset`, border-radius
 * corner names, and the logical→physical side mapping. The logical mapping
 * is a pure function over an explicit `Directionality` fact supplied by the
 * integration (browser CSS inspection reads direction/writing-mode from the
 * selected element); this module never touches the DOM or CSSOM.
 */
export const SPACING_SIDES: Record<string, readonly string[]> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};

export const BORDER_RADIUS_CORNERS: Record<string, readonly string[]> = {
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
};

/**
 * Explicit, DOM-free writing facts for logical→physical side mapping. The
 * integration reads `direction` and `writing-mode` from the selected element's
 * computed style and passes them here; the neutral Module applies them.
 */
export interface Directionality {
  /** CSS `direction` value, e.g. `"ltr"` or `"rtl"`. */
  direction: string;
  /** CSS `writing-mode` value, e.g. `"horizontal-tb"` or `"vertical-rl"`. */
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

/**
 * Maps a logical `margin`/`padding`/`inset` property (inline/block forms,
 * with optional start/end edges) to the physical sides it paints, using the
 * element's writing-mode/direction facts. Returns null for non-logical
 * properties. Without directionality the mapping assumes `ltr` /
 * `horizontal-tb`, matching the resolver's element-less behaviour.
 */
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
    sides = direction === "rtl" ? [`${physicalPrefix}bottom`, `${physicalPrefix}top`] : [`${physicalPrefix}top`, `${physicalPrefix}bottom`];
  }

  return edge ? [edge === "start" ? sides[0] : sides[1]] : sides;
}
