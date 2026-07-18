import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { SideValuesField, SIDE_NAMES, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { setStyle } from "./styleActions.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

function sideValueForLink(el: HTMLElement, rows: ResolvedProperty[], property: string): string {
  const row = findTokenRow(rows, property);
  return row?.authored
    || row?.declaredValue
    || row?.resolvedValue
    || getStateStyleValue(el, property);
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
  sideProperties: readonly string[],
): boolean {
  const signatures = sideProperties.map((property) => {
    const row = findTokenRow(rows, property);
    const authored = row?.authored ?? row?.declaredValue ?? "";
    const resolved = row?.resolvedValue ?? getStateStyleValue(el, property);
    return `${authored}|${row?.tokenName ?? ""}|${resolved}`;
  });
  return new Set(signatures).size === 1;
}

export interface SpacingBoxProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function SpacingBox(props: SpacingBoxProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];
  const spacingGroups = [
    { label: "padding", property: "padding" },
    { label: "margin", property: "margin" },
  ] as const;

  return (
    <div className="dt-editor" data-test="spacing-box">
      <div className="dt-editor__title">Spacing</div>
      <div className="dt-spacing">
        {spacingGroups.map(({ label, property }) => {
          const sideProperties = SIDE_NAMES.map((side) => `${property}-${side}`);
          const sideSlots: SideValueSlot[] = SIDE_NAMES.map((side) => ({
            side,
            control: (
              <TokenField
                property={`${property}-${side}`}
                tokenRow={findTokenRow(tokenRows, `${property}-${side}`)}
                domElement={el}
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            ),
          }));

          return (
            <SideValuesField
              key={property}
              label={label}
              data-test={`spacing-${property}`}
              data-property={property}
              resetKey={el}
              defaultLinked={valuesAreLinked(el, tokenRows, sideProperties)}
              onLinkedChange={(linked) => {
                if (!linked) return;
                const sharedValue = sideValueForLink(el, tokenRows, sideProperties[0]!);
                if (!sharedValue) return;
                setStyle(el, property, sharedValue);
                onAfterEdit?.();
              }}
              linkedControl={(
                <TokenField
                  property={property}
                  tokenRow={linkedTokenRow(tokenRows, property, sideProperties)}
                  domElement={el}
                  entries={allEntries}
                  onAfterEdit={onAfterEdit}
                />
              )}
              sides={sideSlots}
            />
          );
        })}
      </div>
    </div>
  );
}
