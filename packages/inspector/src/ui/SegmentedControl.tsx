import type { ReactElement, ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  /** Accessible name; also the visible label when `icon` is omitted. */
  label: string;
  icon?: ReactNode;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  "aria-label": string;
  "data-test"?: string;
  "data-property"?: string;
  className?: string;
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
          <button
            key={option.value}
            type="button"
            className={`button segmented-control__button${selected ? " segmented-control__button--selected" : ""}`}
            aria-label={option.label}
            aria-pressed={selected}
            data-test={option.testId}
            onClick={() => onChange(option.value)}
          >
            {option.icon ?? option.label}
          </button>
        );
      })}
    </div>
  );
}
