import type { ReactElement } from "react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { SizeSection } from "./SizeSection.tsx";
import { LayoutModeRow, type LayoutAddAction } from "./LayoutModeRow.tsx";
import { GridContainerControls } from "./GridSection.tsx";
import { GridChildSection } from "./GridChildSection.tsx";
import { OFFSET_PRESETS, PositionControls, insetKindFor, showsPositionControls } from "./PositionControls.tsx";
import { MarginFieldIcon, SpacingField, projectSpacing, useSpacingVisibility } from "./SpacingField.tsx";
import {
  FlexAlignmentGrid,
  FlexGapField,
  FlexMainGapField,
  FlexWrapToggle,
  useComputedLayoutValue,
} from "./FlexControls.tsx";
import { useLayoutContext } from "./useLayoutContext.ts";

export interface LayoutSectionProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/** The element's box: sizing, how it lays out and pads its children, its margin, and its position when it does more than establish a containing block. */
export function LayoutSection(props: LayoutSectionProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const { revision, notifyAfterEdit, isFlexContainer, isGridContainer, isFlexChild, isGridChild, position } = useLayoutContext(el, selection);
  const common = { domElement: el, editTarget, selection, revision, onAfterEdit: notifyAfterEdit };
  const spacing = projectSpacing(el, selection, tokenRows);
  const spacingProps = { domElement: el, editTarget, selection, entries: allEntries, tokenRows, onAfterEdit: notifyAfterEdit };
  const showPosition = showsPositionControls(el, position);
  // Margin and inset stay out of the section until they hold a value or are added from the options menu.
  const elements = selection?.domElements ?? [el];
  const marginVisibility = useSpacingVisibility("margin", spacing.margin, elements);
  const insetVisibility = useSpacingVisibility("inset", spacing.inset, elements);
  const insetKind = insetKindFor(selection, position);
  const addActions: LayoutAddAction[] = [
    { key: "margin", label: "Add margin", icon: <MarginFieldIcon />, disabled: marginVisibility.visible, onAdd: marginVisibility.show },
    ...(insetKind ? [{ key: "inset", label: "Add inset", disabled: insetVisibility.visible, onAdd: insetVisibility.show }] : []),
  ];
  // A flex item's fields live in the layout options menu; a grid item's also show here once one is set.
  const childPlacement = isGridChild
    ? { kind: "grid" as const, controls: <GridChildSection {...common} /> }
    : null;

  return (
    <div className="editor" data-test="layout-section">
      <div className="editor__title">Layout</div>
      <div className="layout">
        <SizeSection
          domElement={el}
          editTarget={editTarget}
          selection={selection}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={notifyAfterEdit}
          childPlacement={childPlacement}
        />
        <div className="layout__display-group">
          <LayoutModeRow
            {...common}
            isFlexContainer={isFlexContainer}
            isGridContainer={isGridContainer}
            isFlexChild={isFlexChild}
            isGridChild={isGridChild}
            addActions={addActions}
          />
          {isFlexContainer ? <FlexContainerControls {...common} entries={allEntries} tokenRows={tokenRows} /> : null}
          {isGridContainer ? <GridContainerControls {...common} entries={allEntries} tokenRows={tokenRows} /> : null}
          <SpacingField
            property="padding"
            showLabel={false}
            projection={spacing.padding}
            {...spacingProps}
          />
        </div>
        <SpacingField property="margin" projection={spacing.margin} visibility={marginVisibility} {...spacingProps} />
        {showPosition ? <PositionControls {...common} /> : null}
        {insetKind ? (
          <SpacingField
            property="inset"
            projection={spacing.inset}
            visibility={insetVisibility}
            suggestions={insetKind === "anchored" ? OFFSET_PRESETS : undefined}
            {...spacingProps}
          />
        ) : null}
      </div>
    </div>
  );
}

interface FlexContainerControlsProps {
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  revision: number;
  onAfterEdit: () => void;
}

/** Placement grid, gaps, wrap and distribution; direction lives in the layout mode row. */
function FlexContainerControls({ entries, tokenRows, ...common }: FlexContainerControlsProps): ReactElement {
  const { domElement, selection, revision } = common;
  const [flexDirection] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [flexWrap] = useComputedLayoutValue(domElement, "flex-wrap", "nowrap", revision);
  const selectedDirection = selection?.getProperty("flex-direction")?.value;
  const selectedWrap = selection?.getProperty("flex-wrap")?.value;
  const mixedDirection = selectedDirection?.kind === "mixed";
  const sharedDirection = selectedDirection?.kind === "common" ? selectedDirection.value : flexDirection;
  const sharedWrap = selectedWrap?.kind === "common" ? selectedWrap.value : flexWrap;
  const isWrapped = mixedDirection || selectedWrap?.kind === "mixed" || sharedWrap !== "nowrap";
  const mainGap = !mixedDirection && sharedDirection.startsWith("column") ? "row-gap" : "column-gap";
  const lineGap = mainGap === "row-gap" ? "column-gap" : "row-gap";

  return (
    <div className="layout__flex" data-test="layout-flex-container">
      {mixedDirection ? (
        <div className="layout__alignment-grid" data-test="layout-flex-axis-mixed">
          Choose a shared flex direction to edit physical alignment.
        </div>
      ) : (
        <FlexAlignmentGrid {...common} />
      )}
      <div className="layout__flex-gaps" data-test="layout-gap">
        <FlexMainGapField property={mainGap} entries={entries} tokenRows={tokenRows} {...common} />
        {isWrapped ? <FlexGapField property={lineGap} entries={entries} tokenRows={tokenRows} {...common} /> : null}
      </div>
      <div className="layout__flex-toggles">
        <FlexWrapToggle {...common} />
      </div>
    </div>
  );
}
