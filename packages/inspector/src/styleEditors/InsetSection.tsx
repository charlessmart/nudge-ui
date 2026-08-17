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
import { MarginSideIndicator, SIDE_NAMES, SideValuesField, type SideValueSlot } from "../ui/SideValuesField.tsx";
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
    <SideValuesField
      label="Inset"
      data-test="layout-inset"
      data-property="inset"
      resetKey={el}
      defaultLinked={false}
      empty={insetIsEmpty && !fieldsAdded}
      onAdd={() => setFieldsAdded(true)}
      emptyAction={(
        <IconButton
          variant="quiet"
          size="default"
          data-test="add-inset"
          label="Add Inset Values"
          title="Add Inset Values"
          onClick={() => setFieldsAdded(true)}
        >
          <IconPlus size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      headerAction={(
        <IconButton
          variant="quiet"
          size="default"
          data-test="remove-inset"
          label="Remove Inset Values"
          title="Remove Inset Values"
          onClick={removeValues}
        >
          <IconMinus size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      sides={sides}
    />
  );
}

function findTokenRow(rows: ResolvedProperty[], property: string): ResolvedProperty | null {
  return rows.find((row) => row.property === property) ?? null;
}

function isEmptyInsetValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "auto" || /^-?0(?:\.0+)?(?:[a-z%]+)?$/.test(normalized);
}
