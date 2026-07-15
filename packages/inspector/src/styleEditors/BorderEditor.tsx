import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge"];

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface BorderEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BorderEditor(props: BorderEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;

  const [styleChoice, setStyleChoice] = useState("solid");

  const borderColorRow = findTokenRow(tokenRows, "border-color")
    ?? findTokenRow(tokenRows, "border-top-color")
    ?? findTokenRow(tokenRows, "border");
  const borderRadiusRow = findTokenRow(tokenRows, "border-radius");
  const boxShadowRow = findTokenRow(tokenRows, "box-shadow");
  const borderWidthRow = findTokenRow(tokenRows, "border-width")
    ?? findTokenRow(tokenRows, "border-top-width")
    ?? findTokenRow(tokenRows, "border");

  useEffect(() => {
    const computed = getComputedStyle(el);
    setStyleChoice(computed.getPropertyValue("border-top-style") || "solid");
  }, [el]);

  function handleStyle(s: string): void {
    setStyleChoice(s);
    setStyle(el, "border-style", s);
    onAfterEdit?.();
  }

  return (
    <div className="dt-editor" data-test="border-editor">
      <div className="dt-editor__title">Border · radius · shadow</div>
      <div className="dt-border">
        <FieldRow label="border-width">
          <TokenField
            property="border-width"
            tokenRow={borderWidthRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="border-style">
          <Select
            data-test="border-style"
            value={styleChoice}
            options={BORDER_STYLES.map((s) => ({ value: s, label: s }))}
            onValueChange={handleStyle}
          />
        </FieldRow>
        <FieldRow label="border-color">
          <TokenField
            property="border-color"
            tokenRow={borderColorRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="border-radius">
          <TokenField
            property="border-radius"
            tokenRow={borderRadiusRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="box-shadow">
          <TokenField
            property="box-shadow"
            tokenRow={boxShadowRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
      </div>
    </div>
  );
}
