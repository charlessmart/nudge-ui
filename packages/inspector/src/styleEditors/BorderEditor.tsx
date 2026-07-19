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
import { SideValuesField, SIDE_NAMES } from "../ui/SideValuesField.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../stateValue.ts";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge"];
const BORDER_SIDES = SIDE_NAMES.map((side) => `border-${side}`);

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

function sideValueForLink(el: HTMLElement, rows: ResolvedProperty[], property: string, fallback = ""): string {
  const row = findTokenRow(rows, property);
  if (row?.structure) {
    if (property.endsWith("-width")) return row.structure.width;
    if (property.endsWith("-style")) return row.structure.style;
    if (property.endsWith("-color")) return row.structure.color;
  }
  return row?.authored
    || row?.declaredValue
    || row?.resolvedValue
    || getStateStyleValue(el, property, fallback);
}

function linkBorderSides(
  el: HTMLElement,
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
  onAfterEdit?: () => void,
): void {
  const sharedValue = sideValueForLink(el, rows, sideProperties[0]!, shorthand === "border-style" ? "solid" : "");
  if (!sharedValue) return;
  setStyle(el, shorthand, sharedValue);
  onAfterEdit?.();
}

function linkedTokenRow(
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
): ResolvedProperty | null {
  const direct = findTokenRow(rows, shorthand);
  if (direct) return direct;
  const first = findTokenRow(rows, sideProperties[0]!);
  return first ? { ...first, property: shorthand } : null;
}

function valuesAreLinked(
  el: HTMLElement,
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
): boolean {
  const hasDirectRow = Boolean(findTokenRow(rows, shorthand));
  const hasSideRows = sideProperties.some((property) => Boolean(findTokenRow(rows, property)));
  if (hasDirectRow && !hasSideRows) return true;

  const signatures = sideProperties.map((property) => {
    const row = findTokenRow(rows, property);
    const authored = row?.authored ?? row?.declaredValue ?? "";
    const resolved = row?.resolvedValue ?? getStateStyleValue(el, property);
    return `${authored}|${row?.tokenName ?? ""}|${resolved}`;
  });
  return new Set(signatures).size === 1;
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
  const borderWidthProperties = BORDER_SIDES.map((side) => `${side}-width`);
  const borderStyleProperties = BORDER_SIDES.map((side) => `${side}-style`);
  const borderColorProperties = BORDER_SIDES.map((side) => `${side}-color`);

  const borderWidthLinked = valuesAreLinked(el, tokenRows, "border-width", borderWidthProperties);
  const borderStyleLinked = valuesAreLinked(el, tokenRows, "border-style", borderStyleProperties);
  const borderColorLinked = valuesAreLinked(el, tokenRows, "border-color", borderColorProperties);

  const borderRadiusRow = findTokenRow(tokenRows, "border-radius");
  const boxShadowRow = findTokenRow(tokenRows, "box-shadow");

  return (
    <div className="dt-editor" data-test="border-editor">
      <div className="dt-editor__title">Border · Radius · Shadow</div>
      <div className="dt-border">
        <SideValuesField
          label="Border Width"
          data-test="border-sides"
          data-property="border-width"
          resetKey={el}
          defaultLinked={borderWidthLinked}
          onLinkedChange={(linked) => {
            if (linked) linkBorderSides(el, tokenRows, "border-width", borderWidthProperties, onAfterEdit);
          }}
          linkedControl={(
            <TokenField
              property="border-width"
              tokenRow={linkedTokenRow(tokenRows, "border-width", borderWidthProperties)}
              domElement={el}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          )}
          sides={borderWidthProperties.map((property, index) => ({
            side: SIDE_NAMES[index]!,
            control: (
              <TokenField
                property={property}
                tokenRow={findTokenRow(tokenRows, property)}
                domElement={el}
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            ),
          }))}
        />
        <SideValuesField
          label="Border Style"
          data-test="border-style-sides"
          data-property="border-style"
          resetKey={el}
          defaultLinked={borderStyleLinked}
          onLinkedChange={(linked) => {
            if (linked) linkBorderSides(el, tokenRows, "border-style", borderStyleProperties, onAfterEdit);
          }}
          linkedControl={<BorderStyleControl property="border-style" domElement={el} onAfterEdit={onAfterEdit} />}
          sides={borderStyleProperties.map((property, index) => ({
            side: SIDE_NAMES[index]!,
            control: <BorderStyleControl property={property} domElement={el} onAfterEdit={onAfterEdit} />,
          }))}
        />
        <SideValuesField
          label="Border Color"
          data-test="border-color-sides"
          data-property="border-color"
          resetKey={el}
          defaultLinked={borderColorLinked}
          onLinkedChange={(linked) => {
            if (linked) linkBorderSides(el, tokenRows, "border-color", borderColorProperties, onAfterEdit);
          }}
          linkedControl={(
            <TokenField
              property="border-color"
              tokenRow={linkedTokenRow(tokenRows, "border-color", borderColorProperties)}
              domElement={el}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          )}
          sides={borderColorProperties.map((property, index) => ({
            side: SIDE_NAMES[index]!,
            control: (
              <TokenField
                property={property}
                tokenRow={findTokenRow(tokenRows, property)}
                domElement={el}
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            ),
          }))}
        />
        <FieldRow label="Border Radius">
          <TokenField
            property="border-radius"
            tokenRow={borderRadiusRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="Box Shadow">
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

interface BorderStyleControlProps {
  property: string;
  domElement: HTMLElement;
  onAfterEdit?: () => void;
}

function BorderStyleControl({ property, domElement: el, onAfterEdit }: BorderStyleControlProps): ReactElement {
  const [value, setValue] = useState(() => getStateStyleValue(el, property, "solid") || "solid");

  useEffect(() => {
    setValue(getStateStyleValue(el, property, "solid") || "solid");
  }, [el, property]);

  function handleChange(next: string): void {
    setValue(next);
    setStyle(el, property, next);
    onAfterEdit?.();
  }

  return (
    <Select
      data-test={property === "border-style" ? "border-style" : `border-style-${property.slice("border-".length, -"-style".length)}`}
      value={value}
      options={BORDER_STYLES.map((style) => ({ value: style, label: formatInspectorLabel(style) }))}
      onValueChange={handleChange}
    />
  );
}
