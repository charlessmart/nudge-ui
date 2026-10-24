export type LayoutMode = "block" | "row" | "column" | "grid";

export interface LayoutModeEdit {
  readonly property: "display" | "flex-direction";
  readonly value: string;
}

const FLEX_DISPLAYS = new Set(["flex", "inline-flex"]);
const GRID_DISPLAYS = new Set(["grid", "inline-grid"]);

/** Display values that have no segment (inline, none, contents, table...) read as no mode. */
export function layoutModeOf(display: string, flexDirection: string): LayoutMode | null {
  if (FLEX_DISPLAYS.has(display)) return flexDirection.startsWith("column") ? "column" : "row";
  if (GRID_DISPLAYS.has(display)) return "grid";
  return display === "block" ? "block" : null;
}

/** Edits that move an element to `target`, keeping an inline outer display and a reverse direction. With an unknown current state (a mixed selection) every property is written. */
export function layoutModeEdits(
  current: { readonly display: string; readonly flexDirection: string } | null,
  target: LayoutMode,
): LayoutModeEdit[] {
  const inline = current?.display.startsWith("inline-") ?? false;
  const edits: LayoutModeEdit[] = [];
  const display = target === "block"
    ? inline ? "inline-block" : "block"
    : target === "grid"
      ? inline ? "inline-grid" : "grid"
      : inline ? "inline-flex" : "flex";
  if (display !== current?.display) edits.push({ property: "display", value: display });
  if (target === "row" || target === "column") {
    const reverse = current !== null && FLEX_DISPLAYS.has(current.display) && current.flexDirection.endsWith("-reverse");
    const direction = `${target}${reverse ? "-reverse" : ""}`;
    // A non-flex element's computed direction is the initial row, so moving to row needs no declaration.
    if (direction !== current?.flexDirection) edits.push({ property: "flex-direction", value: direction });
  }
  return edits;
}
