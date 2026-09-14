import type { ReactElement } from "react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export interface BoxShadowEditorProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BoxShadowEditor(props: BoxShadowEditorProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const tokenRow = tokenRows.find((row) => row.property === "box-shadow") ?? null;

  return (
    <div className="editor" data-test="box-shadow-editor">
      <div className="editor__title">Box Shadow</div>
      <div className="property">
        <FieldRow label="Box Shadow">
          <ControlSurface>
            <TokenField
              property="box-shadow"
              selection={selection}
              tokenRow={tokenRow}
              domElement={el}
              editTarget={editTarget}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          </ControlSurface>
        </FieldRow>
      </div>
    </div>
  );
}
