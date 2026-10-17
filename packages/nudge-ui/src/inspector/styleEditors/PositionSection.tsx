import type { ReactElement } from "react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { SpacingField, projectSpacing } from "./SpacingField.tsx";
import { LayoutValueField, FlexChildSettingsMenu } from "./FlexControls.tsx";
import { GridChildSection } from "./GridChildSection.tsx";
import { useLayoutContext } from "./useLayoutContext.ts";

const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const Z_INDEX_PRESETS = ["auto", "0", "1", "10", "100"];
const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];
const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "0%", "100%", "50%", "fit-content"];

export interface PositionSectionProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/** How the element sits in its parent and on the page: positioning, margin and the parent's flex or grid placement. */
export function PositionSection(props: PositionSectionProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const { revision, notifyAfterEdit, isFlexChild, isGridChild, position } = useLayoutContext(el, selection, onAfterEdit);
  const common = { domElement: el, editTarget, selection, revision, onAfterEdit: notifyAfterEdit };
  const spacing = projectSpacing(el, selection, tokenRows);
  const spacingProps = { domElement: el, editTarget, selection, entries: allEntries, tokenRows, onAfterEdit: notifyAfterEdit };
  const showAnchoredInsets = selection ? selection.supportsRole("inset-position") : position === "absolute" || position === "fixed";
  const showOffsetInsets = selection ? selection.supportsRole("relative-position") : position === "relative" || position === "sticky";

  return (
    <div className="editor" data-test="position-section">
      <div className="editor__title">Position</div>
      <div className="layout">
        <div className="layout__tool-row">
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
        <SpacingField property="margin" projection={spacing.margin} {...spacingProps} />
        {isFlexChild ? (
          <div className="layout__group" data-test="layout-flex-child">
            <div className="layout__flex-heading">
              <div className="editor__title">Flex Child</div>
              <FlexChildSettingsMenu {...common} />
            </div>
            <div className="layout__flex-child-fields">
              <LayoutValueField label="Grow" property="flex-grow" presets={FLEX_GROW_PRESETS} inputOnly {...common} />
              <LayoutValueField label="Shrink" property="flex-shrink" presets={FLEX_SHRINK_PRESETS} inputOnly {...common} />
              <LayoutValueField label="Basis" property="flex-basis" presets={FLEX_BASIS_PRESETS} inputOnly {...common} />
            </div>
          </div>
        ) : null}
        {isGridChild ? <GridChildSection {...common} /> : null}
      </div>
    </div>
  );
}
