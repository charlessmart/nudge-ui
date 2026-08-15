import { Select as BaseSelect } from "@base-ui/react/select";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import type { ControlAppearance } from "./ControlSurface.tsx";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export type SelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
  value?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  compact?: boolean;
  appearance?: ControlAppearance;
  onValueChange?: (value: string) => void;
  "data-test"?: string;
};

export function Select({
  value,
  options = [],
  groups = [],
  placeholder,
  compact,
  appearance = "default",
  className,
  disabled,
  children,
  ...props
}: SelectProps): ReactElement {
  const allOptions = [...options, ...groups.flatMap((group) => group.options)];
  const selectedOption = allOptions.find((option) => option.value === value);
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("design-tool-root")?.shadowRoot ?? document.body
    : null;

  function handleValueChange(next: string | null): void {
    if (typeof next === "string") props.onValueChange?.(next);
  }

  const { onValueChange: _onValueChange, ...triggerProps } = props;

  return (
    <BaseSelect.Root
      value={value || null}
      disabled={disabled}
      items={allOptions.map((option) => ({ value: option.value, label: option.label }))}
      onValueChange={handleValueChange}
    >
      <BaseSelect.Trigger
        {...triggerProps}
        disabled={disabled}
        className={`dt-select${compact ? " dt-select--compact" : ""}${appearance === "embedded" ? " dt-select--embedded" : ""}${className ? ` ${className}` : ""}`}
      >
        <BaseSelect.Value className="dt-select__value" placeholder={placeholder}>
          {selectedOption?.label ?? (value || undefined)}
        </BaseSelect.Value>
        <BaseSelect.Icon className="dt-select__icon">
          <IconChevronDown size={15} stroke={1.8} aria-hidden="true" />
        </BaseSelect.Icon>
        {children}
      </BaseSelect.Trigger>
      <BaseSelect.Portal container={portalContainer}>
        <BaseSelect.Positioner className="dt-select__positioner" sideOffset={4}>
          <BaseSelect.Popup className="dt-select__popup">
            <BaseSelect.List className="dt-select__list">
              {options.map((option) => <SelectItem key={option.value} option={option} />)}
              {groups.map((group) => (
                <BaseSelect.Group className="dt-select__group" key={group.label}>
                  <BaseSelect.GroupLabel className="dt-select__group-label">
                    {group.label}
                  </BaseSelect.GroupLabel>
                  {group.options.map((option) => <SelectItem key={`${group.label}-${option.value}`} option={option} />)}
                </BaseSelect.Group>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }): ReactElement {
  return (
    <BaseSelect.Item
      className="dt-select__item"
      value={option.value}
      label={option.label}
      disabled={option.disabled}
      data-value={option.value}
    >
      <BaseSelect.ItemIndicator className="dt-select__item-indicator">
        <IconCheck size={15} stroke={2.4} aria-hidden="true" />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className="dt-select__item-text">
        {option.label}
      </BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
