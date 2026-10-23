import type { ReactElement } from "react";
import { ALIGN_SELF_OPTIONS, LayoutValueField, ORDER_PRESETS } from "./FlexControls.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "0%", "100%", "50%", "fit-content"];

export interface FlexChildOptionsProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  revision?: number;
  onAfterEdit?: () => void;
}

/** How a flex item shares its parent's space, in the layout options menu. */
export function FlexChildOptions(props: FlexChildOptionsProps): ReactElement {
  return (
    <div className="layout__options-group" data-test="layout-options-flex-child">
      <span className="layout__subheading">Flex child</span>
      <div className="layout__options-triple">
        <LayoutValueField label="Grow" property="flex-grow" presets={FLEX_GROW_PRESETS} inputOnly {...props} />
        <LayoutValueField label="Shrink" property="flex-shrink" presets={FLEX_SHRINK_PRESETS} inputOnly {...props} />
        <LayoutValueField label="Basis" property="flex-basis" presets={FLEX_BASIS_PRESETS} inputOnly {...props} />
      </div>
      <div className="layout__options-pair">
        <LayoutDropdown property="align-self" options={ALIGN_SELF_OPTIONS} stacked {...props} />
        <LayoutValueField label="Order" property="order" presets={ORDER_PRESETS} inputOnly {...props} />
      </div>
    </div>
  );
}
