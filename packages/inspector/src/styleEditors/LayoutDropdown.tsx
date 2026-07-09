import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";

export interface LayoutDropdownProps {
  property: string;
  options: string[];
  domElement: HTMLElement;
  onAfterEdit?: () => void;
}

export function LayoutDropdown(props: LayoutDropdownProps): ReactElement {
  const { property, options, domElement: el, onAfterEdit } = props;

  const [value, setValue] = useState(() =>
    getComputedStyle(el).getPropertyValue(property).trim() || options[0],
  );

  useEffect(() => {
    try {
      setValue(getComputedStyle(el).getPropertyValue(property).trim() || options[0]);
    } catch {
      // noop
    }
  }, [el, property, options]);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = e.target.value;
    setValue(next);
    setStyle(el, property, next);
    onAfterEdit?.();
  }

  const allOptions = value && !options.includes(value) ? [...options, value] : options;

  return (
    <div className="dt-layout-field" data-test="layout-dropdown" data-property={property}>
      <span className="dt-layout-field__label">{property}</span>
      <select
        className="dt-layout-field__select"
        data-test={`layout-select-${property}`}
        value={value}
        onChange={handleChange}
      >
        {allOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
