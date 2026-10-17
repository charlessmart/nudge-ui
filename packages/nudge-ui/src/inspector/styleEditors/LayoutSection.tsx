import type { ReactElement } from "react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { SizeSection } from "./SizeSection.tsx";
import { LayoutModeRow } from "./LayoutModeRow.tsx";
import { GridContainerControls } from "./GridSection.tsx";
import { SpacingField, projectSpacing } from "./SpacingField.tsx";
import {
  FlexAlignmentGrid,
  FlexDistributionControl,
  FlexGapField,
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

/** The element's own box: how it is sized and how it lays out and pads its children. */
export function LayoutSection(props: LayoutSectionProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const { revision, notifyAfterEdit, isFlexContainer, isGridContainer } = useLayoutContext(el, selection, onAfterEdit);
  const common = { domElement: el, editTarget, selection, revision, onAfterEdit: notifyAfterEdit };

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
          revision={revision}
          onAfterEdit={notifyAfterEdit}
        />
        <LayoutModeRow {...common} isFlexContainer={isFlexContainer} isGridContainer={isGridContainer} />
        {isFlexContainer ? <FlexContainerControls {...common} entries={allEntries} tokenRows={tokenRows} /> : null}
        {isGridContainer ? <GridContainerControls {...common} entries={allEntries} tokenRows={tokenRows} /> : null}
        <SpacingField
          property="padding"
          projection={projectSpacing(el, selection, tokenRows).padding}
          domElement={el}
          editTarget={editTarget}
          selection={selection}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={notifyAfterEdit}
        />
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
        <FlexGapField property={mainGap} entries={entries} tokenRows={tokenRows} {...common} />
        {isWrapped ? <FlexGapField property={lineGap} entries={entries} tokenRows={tokenRows} {...common} /> : null}
      </div>
      <div className="layout__flex-toggles">
        <FlexDistributionControl {...common} />
        <FlexWrapToggle {...common} />
      </div>
    </div>
  );
}
