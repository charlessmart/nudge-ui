import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { projectInspectorValues, projectInspectorValuesForSelection } from "../spacing/projection.ts";
import { SpacingField } from "./SpacingBox.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];

export interface PositionInsetsProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  revision?: number;
  onAfterEdit?: () => void;
}

export function PositionInsets({
  domElement: el,
  editTarget,
  selection,
  entries,
  tokenRows = [],
  onAfterEdit,
}: PositionInsetsProps): ReactElement {
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const projection = selection
    ? projectInspectorValuesForSelection(selection)
    : projectInspectorValues(el, tokenRows);

  return (
    <div className="layout__group" data-test="layout-position">
      <div className="editor__title">Position</div>
      <SpacingField
        property="inset"
        projection={projection.spacing.inset}
        domElement={el}
        editTarget={editTarget}
        selection={selection}
        entries={allEntries}
        tokenRows={tokenRows}
        onAfterEdit={onAfterEdit}
        showLabel={false}
        showEmptyState={false}
        suggestions={OFFSET_PRESETS}
      />
    </div>
  );
}
