import type { ReactElement, ReactNode } from "react";
import { Toggle } from "@base-ui/react/toggle";

export interface SegmentedControlOption<T extends string> {
  value: T;
  /** Accessible name; also the visible label when `icon` is omitted. */
  label: string;
  icon?: ReactNode;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T | null;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  "aria-label": string;
  "data-test"?: string;
  "data-property"?: string;
  className?: string;
  /** Allows the active option to be cleared by clicking it again. */
  allowDeselect?: boolean;
  /** Restores the value represented by an unselected control. */
  onDeselect?: () => void;
}

/** A compact single-choice control for adjacent, peer actions. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  "data-test": dataTest,
  "data-property": dataProperty,
  className,
  allowDeselect = false,
  onDeselect,
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div
      className={`segmented-control${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
      data-test={dataTest}
      data-property={dataProperty}
    >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Toggle
              key={option.value}
              type="button"
              className={`button segmented-control__button${selected ? " segmented-control__button--selected" : ""}`}
              pressed={selected}
              aria-label={option.label}
              title={option.label}
              data-test={option.testId}
              data-active={selected ? "true" : "false"}
              onPressedChange={(pressed) => {
                if (pressed) {
                  onChange(option.value);
                } else if (allowDeselect) {
                  onDeselect?.();
                }
              }}
            >
              {option.icon ?? option.label}
            </Toggle>
          );
        })}
    </div>
  );
}
