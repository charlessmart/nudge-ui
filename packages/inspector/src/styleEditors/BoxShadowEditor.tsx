import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getDesignToolTokenEntries } from "../runtimeConfig.ts";

export interface BoxShadowEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BoxShadowEditor(props: BoxShadowEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? getDesignToolTokenEntries();
  const tokenRow = tokenRows.find((row) => row.property === "box-shadow") ?? null;

  return (
    <div className="dt-editor" data-test="box-shadow-editor">
      <div className="dt-editor__title">Box Shadow</div>
      <div className="dt-property">
        <FieldRow label="Box Shadow">
          <ControlSurface>
            <TokenField
              property="box-shadow"
              tokenRow={tokenRow}
              domElement={el}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          </ControlSurface>
        </FieldRow>
      </div>
    </div>
  );
}
