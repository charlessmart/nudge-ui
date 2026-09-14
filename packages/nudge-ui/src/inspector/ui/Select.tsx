import { Select as BaseSelect } from "@base-ui/react/select";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
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
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  onValueChange?: (value: string) => void;
  "data-test"?: string;
};

export function Select(props: SelectProps): ReactElement {
  if (props.searchable) return <SearchableSelect {...props} />;
  return <NativeSelect {...props} />;
}

function NativeSelect({
  value,
  options = [],
  groups = [],
  placeholder,
  compact,
  appearance = "default",
  searchable: _searchable,
  searchPlaceholder: _searchPlaceholder,
  searchAriaLabel: _searchAriaLabel,
  className,
  disabled,
  children,
  ...props
}: SelectProps): ReactElement {
  const allOptions = [...options, ...groups.flatMap((group) => group.options)];
  const selectedOption = allOptions.find((option) => option.value === value);
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
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
        className={`select${compact ? " select--compact" : ""}${appearance === "embedded" ? " select--embedded" : ""}${className ? ` ${className}` : ""}`}
      >
        <BaseSelect.Value className="select__value" placeholder={placeholder}>
          {selectedOption?.label ?? (value || undefined)}
        </BaseSelect.Value>
        <BaseSelect.Icon className="select__icon">
          <IconChevronDown size={15} stroke={1.8} aria-hidden="true" />
        </BaseSelect.Icon>
        {children}
      </BaseSelect.Trigger>
      <BaseSelect.Portal container={portalContainer}>
        <BaseSelect.Positioner className="select__positioner" sideOffset={4}>
          <BaseSelect.Popup className="select__popup">
            <BaseSelect.List className="select__list">
              {options.map((option) => <SelectItem key={option.value} option={option} />)}
              {groups.map((group) => (
                <BaseSelect.Group className="select__group" key={group.label}>
                  <BaseSelect.GroupLabel className="select__group-label">
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

interface SearchableGroup {
  value: string;
  label?: string;
  items: string[];
}

function SearchableSelect({
  value,
  options = [],
  groups = [],
  placeholder,
  compact,
  appearance = "default",
  searchable: _searchable,
  searchPlaceholder = "Search…",
  searchAriaLabel = "Search options",
  className,
  disabled,
  children,
  "data-test": dataTest,
  ...props
}: SelectProps): ReactElement {
  const allOptions = [...options, ...groups.flatMap((group) => group.options)];
  const selectedOption = allOptions.find((option) => option.value === value);
  const optionByValue = new Map(allOptions.map((option) => [option.value, option]));
  const searchableGroups: SearchableGroup[] = [
    ...(options.length > 0
      ? [{ value: "__ungrouped__", items: options.map((option) => option.value) }]
      : []),
    ...groups.map((group, index) => ({
      value: `group-${index}-${group.label}`,
      label: group.label,
      items: group.options.map((option) => option.value),
    })),
  ];
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;

  function handleValueChange(next: string | null): void {
    if (typeof next === "string") props.onValueChange?.(next);
  }

  const { onValueChange: _onValueChange, ...triggerProps } = props;
  const triggerClassName = `select${compact ? " select--compact" : ""}${appearance === "embedded" ? " select--embedded" : ""}${className ? ` ${className}` : ""}`;

  return (
    <BaseCombobox.Root
      value={value || null}
      disabled={disabled}
      items={searchableGroups}
      itemToStringLabel={(item: string) => optionByValue.get(item)?.label ?? item}
      autoHighlight
      onValueChange={handleValueChange}
    >
      <BaseCombobox.Trigger
        {...triggerProps}
        data-test={dataTest}
        disabled={disabled}
        className={triggerClassName}
      >
        <span className="select__value">
          <BaseCombobox.Value placeholder={placeholder}>
            {selectedOption?.label ?? (value || undefined)}
          </BaseCombobox.Value>
        </span>
        <BaseCombobox.Icon className="select__icon">
          <IconChevronDown size={15} stroke={1.8} aria-hidden="true" />
        </BaseCombobox.Icon>
        {children}
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal container={portalContainer}>
        <BaseCombobox.Positioner className="select__positioner" sideOffset={4}>
          <BaseCombobox.Popup className="select__popup select__popup--searchable">
            <BaseCombobox.Input
              className="select__search-input"
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              data-test={dataTest ? `${dataTest}-search` : "select-search"}
            />
            <BaseCombobox.Empty className="select__empty">
              No matching options.
            </BaseCombobox.Empty>
            <BaseCombobox.List className="select__list select__list--searchable">
              {(group: SearchableGroup) => (
                <BaseCombobox.Group
                  className="select__group"
                  key={group.value}
                  items={group.items}
                >
                  {group.label ? (
                    <BaseCombobox.GroupLabel className="select__group-label">
                      {group.label}
                    </BaseCombobox.GroupLabel>
                  ) : null}
                  <BaseCombobox.Collection>
                    {(item: string) => {
                      const option = optionByValue.get(item);
                      return option ? <SearchableSelectItem key={item} option={option} /> : null;
                    }}
                  </BaseCombobox.Collection>
                </BaseCombobox.Group>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }): ReactElement {
  return (
    <BaseSelect.Item
      className="select__item"
      value={option.value}
      label={option.label}
      disabled={option.disabled}
      data-value={option.value}
    >
      <BaseSelect.ItemText className="select__item-text">
        {option.label}
      </BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className="select__item-indicator">
        <IconCheck size={15} stroke={2.4} aria-hidden="true" />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

function SearchableSelectItem({ option }: { option: SelectOption }): ReactElement {
  return (
    <BaseCombobox.Item
      className="select__item"
      value={option.value}
      disabled={option.disabled}
      data-value={option.value}
    >
      <span className="select__item-text">{option.label}</span>
      <BaseCombobox.ItemIndicator className="select__item-indicator">
        <IconCheck size={15} stroke={2.4} aria-hidden="true" />
      </BaseCombobox.ItemIndicator>
    </BaseCombobox.Item>
  );
}
