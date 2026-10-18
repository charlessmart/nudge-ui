import type { ReactElement } from "react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutValueField } from "./FlexControls.tsx";
import { SpacingField, projectSpacing } from "./SpacingField.tsx";

export const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
export const Z_INDEX_PRESETS = ["auto", "0", "1", "10", "100"];
const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];

export interface PositionControlsProps {
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  position: string;
  revision: number;
  onAfterEdit: () => void;
}

/** Position, z-index and insets for an element that is not static; static elements set these from the options menu. */
export function PositionControls({ domElement, editTarget, selection, entries, tokenRows, position, revision, onAfterEdit }: PositionControlsProps): ReactElement {
  const common = { domElement, editTarget, selection, revision, onAfterEdit };
  const spacing = projectSpacing(domElement, selection, tokenRows);
  const spacingProps = { domElement, editTarget, selection, entries, tokenRows, onAfterEdit };
  const showAnchoredInsets = selection ? selection.supportsRole("inset-position") : position === "absolute" || position === "fixed";
  const showOffsetInsets = selection ? selection.supportsRole("relative-position") : position === "relative" || position === "sticky";

  return (
    <>
      <div className="layout__tool-row" data-test="layout-position">
        <LayoutDropdown property="position" options={POSITION_OPTIONS} {...common} />
        <LayoutValueField label="Z-index" property="z-index" presets={Z_INDEX_PRESETS} inputOnly {...common} />
      </div>
      {showAnchoredInsets ? (
        <SpacingField
          property="inset"
          projection={spacing.inset}
          showLabel={false}
          showEmptyState={false}
          suggestions={OFFSET_PRESETS}
          {...spacingProps}
        />
      ) : null}
      {showOffsetInsets ? <SpacingField property="inset" projection={spacing.inset} {...spacingProps} /> : null}
    </>
  );
}
