import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import type { SelectedElement } from "../selectionStore.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { setStyles } from "../tokens/editActions.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { MarginSideIndicator, SIDE_NAMES, SideControls, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";

export interface InsetSectionProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function InsetSection({
  element,
  entries = [],
  tokenRows = [],
  onAfterEdit,
}: InsetSectionProps): ReactElement | null {
  const el = element.domElement;
  const position = getStateStyleValue(el, "position", "static").trim().toLowerCase();
  const [fieldsAdded, setFieldsAdded] = useState(false);
  const insetIsEmpty = SIDE_NAMES.every((side) => isEmptyInsetValue(getStateStyleValue(el, side, "auto")));
  const showFields = !insetIsEmpty || fieldsAdded;

  useEffect(() => {
    setFieldsAdded(false);
  }, [el]);

  useEffect(() => {
    if (!insetIsEmpty) setFieldsAdded(false);
  }, [insetIsEmpty]);

  if (position !== "relative" && position !== "sticky") return null;

  const sides: SideValueSlot[] = SIDE_NAMES.map((side) => ({
    side,
    icon: <MarginSideIndicator side={side} />,
    control: (
      <TokenField
        property={side}
        tokenRow={findTokenRow(tokenRows, side)}
        initialValue={meaningfulLayoutValue(el, side)}
        domElement={el}
        entries={entries}
        onAfterEdit={onAfterEdit}
      />
    ),
  }));

  function removeValues(): void {
    const records = setStyles(el, SIDE_NAMES.map((side) => ({ property: side, value: "auto" })));
    setFieldsAdded(false);
    if (records.length > 0) onAfterEdit?.();
  }

  return (
    <div className="dt-editor" data-test="layout-inset" data-empty={showFields ? undefined : "true"}>
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">Inset</div>
        <IconButton
          variant="quiet"
          size="default"
          data-test={showFields ? "remove-inset" : "add-inset"}
          label={showFields ? "Remove Inset Values" : "Add Inset Values"}
          title={showFields ? "Remove Inset Values" : "Add Inset Values"}
          onClick={showFields ? removeValues : () => setFieldsAdded(true)}
        >
          {showFields ? (
            <IconMinus size={16} stroke={1.8} aria-hidden="true" />
          ) : (
            <IconPlus size={16} stroke={1.8} aria-hidden="true" />
          )}
        </IconButton>
      </div>
      {showFields ? (
        <div className="dt-spacing">
          <SideControls label="Inset" sides={sides} />
        </div>
      ) : null}
    </div>
  );
}

function findTokenRow(rows: ResolvedProperty[], property: string): ResolvedProperty | null {
  return rows.find((row) => row.property === property) ?? null;
}

function isEmptyInsetValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "auto" || /^-?0(?:\.0+)?(?:[a-z%]+)?$/.test(normalized);
}
