import type { ReactElement } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  "aria-label": string;
  "data-test"?: string;
}

/** A compact single-choice control for adjacent, peer actions. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  "data-test": dataTest,
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div className="dt-segmented-control" role="group" aria-label={ariaLabel} data-test={dataTest}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`dt-segmented-control__button${selected ? " dt-segmented-control__button--selected" : ""}`}
            aria-pressed={selected}
            data-test={option.testId}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
