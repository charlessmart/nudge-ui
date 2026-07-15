import type { ChangeEventHandler, ReactElement, SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  compact?: boolean;
  onValueChange?: (value: string) => void;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  "data-test"?: string;
};

export function Select({
  value,
  options = [],
  groups = [],
  placeholder,
  compact,
  className,
  onValueChange,
  onChange,
  ...props
}: SelectProps): ReactElement {
  return (
    <select
      {...props}
      value={value ?? ""}
      className={`dt-select${compact ? " dt-select--compact" : ""}${className ? ` ${className}` : ""}`}
      onChange={(event) => {
        onValueChange?.(event.target.value);
        onChange?.(event);
      }}
    >
      {placeholder ? <option value="" disabled>{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
