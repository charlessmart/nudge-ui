import type { ReactElement } from "react";
import { FlexChildSettingsMenu, LayoutValueField } from "./FlexControls.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "0%", "100%", "50%", "fit-content"];

export interface FlexChildControlsProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  revision?: number;
  onAfterEdit?: () => void;
}

/** How a flex item shares its parent's space; shown behind the size expander. */
export function FlexChildControls(props: FlexChildControlsProps): ReactElement {
  return (
    <div className="layout__group layout__group--bottom-rule" data-test="layout-flex-child">
      <div className="layout__flex-heading">
        <div className="editor__title">Flex Child</div>
        <FlexChildSettingsMenu {...props} />
      </div>
      <div className="layout__flex-child-fields">
        <LayoutValueField label="Grow" property="flex-grow" presets={FLEX_GROW_PRESETS} inputOnly {...props} />
        <LayoutValueField label="Shrink" property="flex-shrink" presets={FLEX_SHRINK_PRESETS} inputOnly {...props} />
        <LayoutValueField label="Basis" property="flex-basis" presets={FLEX_BASIS_PRESETS} inputOnly {...props} />
      </div>
    </div>
  );
}
