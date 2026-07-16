import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";

export interface LayoutDropdownProps {
  property: string;
  options: string[];
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
}

export function LayoutDropdown(props: LayoutDropdownProps): ReactElement {
  const { property, options, domElement: el, revision = 0, onAfterEdit } = props;

  const [value, setValue] = useState(() =>
    getComputedStyle(el).getPropertyValue(property).trim() || options[0],
  );

  useEffect(() => {
    try {
      setValue(getComputedStyle(el).getPropertyValue(property).trim() || options[0]);
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
    <FieldRow label={property} data-test="layout-dropdown">
      <Select
        data-test={`layout-select-${property}`}
        value={value}
        options={allOptions.map((opt) => ({ value: opt, label: opt }))}
        onValueChange={handleChange}
      />
    </FieldRow>
  );
}
