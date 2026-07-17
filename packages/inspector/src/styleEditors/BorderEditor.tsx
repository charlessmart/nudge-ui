import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { getStateStyleValue } from "../stateValue.ts";

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
  const [focusedSide, setFocusedSide] = useState<string | null>(null);

  const sideValues = useMemo(() => ["top", "right", "bottom", "left"].map((side) => ({
    side,
    width: findTokenRow(tokenRows, `border-${side}-width`),
    style: findTokenRow(tokenRows, `border-${side}-style`),
    color: findTokenRow(tokenRows, `border-${side}-color`),
  })), [tokenRows]);
  const sidesLinked = sideValues.every((candidate) => candidate.width?.resolvedValue === sideValues[0]?.width?.resolvedValue
    && candidate.style?.resolvedValue === sideValues[0]?.style?.resolvedValue
    && candidate.color?.resolvedValue === sideValues[0]?.color?.resolvedValue);
  const focusedProperty = (kind: "width" | "style" | "color"): string => focusedSide ? `border-${focusedSide}-${kind}` : `border-${kind}`;

  const borderColorRow = findTokenRow(tokenRows, "border-color")
    ?? findTokenRow(tokenRows, "border-top-color")
    ?? findTokenRow(tokenRows, "border");
  const borderRadiusRow = findTokenRow(tokenRows, "border-radius");
  const boxShadowRow = findTokenRow(tokenRows, "box-shadow");
  const borderWidthRow = findTokenRow(tokenRows, "border-width")
    ?? findTokenRow(tokenRows, "border-top-width")
    ?? findTokenRow(tokenRows, "border");
  const focusedWidthRow = focusedSide ? findTokenRow(tokenRows, focusedProperty("width")) ?? borderWidthRow : borderWidthRow;
  const focusedColorRow = focusedSide ? findTokenRow(tokenRows, focusedProperty("color")) ?? borderColorRow : borderColorRow;

  useEffect(() => {
    setStyleChoice(getStateStyleValue(el, "border-top-style", "solid"));
  }, [el, tokenRows]);

  function handleStyle(s: string): void {
    setStyleChoice(s);
    setStyle(el, focusedProperty("style"), s);
    onAfterEdit?.();
  }

  return (
    <div className="dt-editor" data-test="border-editor">
      <div className="dt-editor__title">Border · radius · shadow</div>
      <div className="dt-border">
        <div data-test="border-sides" data-linked={sidesLinked ? "true" : "false"}>
          <span>effective sides</span>
          {sideValues.map(({ side }) => (
            <button type="button" key={side} data-test={`border-side-${side}`} aria-pressed={focusedSide === side} onClick={() => setFocusedSide(focusedSide === side ? null : side)}>
              {side}
            </button>
          ))}
        </div>
        <FieldRow label={focusedSide ? `${focusedProperty("width")} · ${focusedSide}` : "border-width"}>
          <TokenField
            property={focusedProperty("width")}
            tokenRow={focusedWidthRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label={focusedSide ? `${focusedProperty("style")} · ${focusedSide}` : "border-style"}>
          <Select
            data-test="border-style"
            value={styleChoice}
            options={BORDER_STYLES.map((s) => ({ value: s, label: s }))}
            onValueChange={handleStyle}
          />
        </FieldRow>
        <FieldRow label={focusedSide ? `${focusedProperty("color")} · ${focusedSide}` : "border-color"}>
          <TokenField
            property={focusedProperty("color")}
            tokenRow={focusedColorRow}
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
