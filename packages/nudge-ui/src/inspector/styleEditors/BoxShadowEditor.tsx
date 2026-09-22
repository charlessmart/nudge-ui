import type { ReactElement } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { hasAuthoredProperty } from "./stylePresence.ts";
import { useFieldVisibility } from "./useFieldVisibility.ts";

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
  const elements = selection?.domElements ?? [el];
  const hasShadow = hasAuthoredProperty(selection, "box-shadow", tokenRow) || elements.some((element) => {
    const value = getStateStyleValue(element, "box-shadow");
    return value !== "" && value !== "none";
  });
  const visibility = useFieldVisibility(elements, "box-shadow", hasShadow);

  return (
    <div className="editor" data-test="box-shadow-editor">
      <div className="editor__title-row">
        <div className="editor__title">Box Shadow</div>
        {!visibility.visible ? (
          <IconButton variant="quiet" label="Add Box Shadow" data-test="add-shadow" onClick={visibility.show}>
            <IconPlus size={16} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
      {visibility.visible ? <div className="property">
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
      </div> : null}
    </div>
  );
}
