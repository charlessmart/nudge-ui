import type { ReactElement } from "react";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutValueField } from "./FlexControls.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";

export const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
export const Z_INDEX_PRESETS = ["auto", "0", "1", "10", "100"];
export const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];

const INSET_SIDES = ["top", "right", "bottom", "left"];

/** Whether the position row belongs in the Layout section rather than only the options menu. A bare `position: relative` is usually just a containing block, so it stays tucked away until it carries a z-index or an offset. */
export function showsPositionControls(el: HTMLElement, position: string): boolean {
  if (position === "static") return false;
  if (position !== "relative") return true;
  if (getStateStyleValue(el, "z-index", "auto") !== "auto") return true;
  return INSET_SIDES.some((side) => meaningfulLayoutValue(el, side) !== "auto");
}

/** Whether the element's offsets pin it to an edge (absolute, fixed) or nudge it from its normal place (relative, sticky). */
export type InsetKind = "anchored" | "offset";

/** Which kind of insets the element can take; null when position makes them meaningless. */
export function insetKindFor(selection: StyleSelection | null | undefined, position: string): InsetKind | null {
  const anchored = selection ? selection.supportsRole("inset-position") : position === "absolute" || position === "fixed";
  if (anchored) return "anchored";
  const offset = selection ? selection.supportsRole("relative-position") : position === "relative" || position === "sticky";
  return offset ? "offset" : null;
}

export interface PositionControlsProps {
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  revision: number;
  onAfterEdit: () => void;
}

/** Position and z-index for an element that {@link showsPositionControls}; insets are added from the options menu. */
export function PositionControls({ domElement, editTarget, selection, revision, onAfterEdit }: PositionControlsProps): ReactElement {
  const common = { domElement, editTarget, selection, revision, onAfterEdit };

  return (
    <div className="layout__tool-row" data-test="layout-position">
      <LayoutDropdown property="position" options={POSITION_OPTIONS} {...common} />
      <LayoutValueField label="Z-index" property="z-index" presets={Z_INDEX_PRESETS} inputOnly {...common} />
    </div>
  );
}
