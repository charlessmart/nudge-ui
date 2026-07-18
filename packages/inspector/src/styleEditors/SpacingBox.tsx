import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { SideValuesField, SIDE_NAMES, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { setStyle } from "./styleActions.ts";
import { projectInspectorValues } from "../conformance/projection.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
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
  const projection = projectInspectorValues(el, tokenRows);
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
          const groupProjection = projection.spacing[property];
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
              defaultLinked={groupProjection.linked}
              onLinkedChange={(linked) => {
                if (!linked) return;
                const sharedValue = groupProjection.fields[SIDE_NAMES[0]!].authoredValue;
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
