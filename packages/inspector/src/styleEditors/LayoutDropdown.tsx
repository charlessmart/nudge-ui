import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { useFieldAtRules } from "../ui/AtRuleContext.tsx";

export interface LayoutDropdownProps {
  property: string;
  options: string[];
  domElement: HTMLElement;
  stacked?: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

export function LayoutDropdown(props: LayoutDropdownProps): ReactElement {
  const { property, options, domElement: el, stacked, revision = 0, onAfterEdit } = props;
  const atRules = useFieldAtRules(property);

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
    setValue(next);
    setStyle(el, property, next);
    onAfterEdit?.();
  }

  const allOptions = value && !options.includes(value) ? [...options, value] : options;

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
        value={value}
        options={allOptions.map((opt) => ({ value: opt, label: formatInspectorLabel(opt) }))}
        onValueChange={handleChange}
      />
    </FieldRow>
  );
}
