import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { useFieldAtRules } from "../ui/AtRuleContext.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export interface LayoutDropdownProps {
  property: string;
  options: string[];
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  stacked?: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

export function LayoutDropdown(props: LayoutDropdownProps): ReactElement {
  const { property, options, domElement: el, editTarget, selection, stacked, revision = 0, onAfterEdit } = props;
  const atRules = useFieldAtRules(property);
  const selectedProperty = selection?.getProperty(property);
  const mixed = selectedProperty?.value.kind === "mixed";

  const [value, setValue] = useState(() =>
    getStateStyleValue(el, property, options[0]),
  );

  useEffect(() => {
    try {
      setValue(getStateStyleValue(el, property, options[0]));
    } catch {
      // noop
    }
  }, [el, property, options, revision]);

  function handleChange(next: string): void {
    if (next === "mixed") return;
    setValue(next);
    setStyle(editTarget ?? el, property, next);
    onAfterEdit?.();
  }

  const allOptions = mixed
    ? ["mixed", ...options]
    : value && !options.includes(value) ? [...options, value] : options;

  return (
    <FieldRow
      label={property}
      property={property}
      atRules={atRules}
      className={stacked ? "field-row--stacked" : undefined}
      data-test="layout-dropdown"
    >
      <Select
        data-test={`layout-select-${property}`}
        value={mixed ? "mixed" : value}
        options={allOptions.map((opt) => ({ value: opt, label: formatInspectorLabel(opt) }))}
        onValueChange={handleChange}
      />
    </FieldRow>
  );
}
