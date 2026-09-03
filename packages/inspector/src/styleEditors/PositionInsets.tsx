import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";
import { projectInspectorValues } from "../spacing/projection.ts";
import { SpacingField } from "./SpacingBox.tsx";

const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];

export interface PositionInsetsProps {
  domElement: HTMLElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  revision?: number;
  onAfterEdit?: () => void;
}

export function PositionInsets({
  domElement: el,
  entries,
  tokenRows = [],
  onAfterEdit,
}: PositionInsetsProps): ReactElement {
  const allEntries = entries ?? getNudgeUiTokenEntries();

  return (
    <div className="layout__group" data-test="layout-position">
      <div className="editor__title">Position</div>
      <SpacingField
        property="inset"
        projection={projectInspectorValues(el, tokenRows).spacing.inset}
        domElement={el}
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
