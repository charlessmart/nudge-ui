import { Fragment, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { Tooltip } from "./Tooltip.tsx";

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
  disabled?: boolean;
  /** Shows each option's label in a tooltip; for icon-only segments. */
  tooltips?: boolean;
  allowDeselect?: boolean;
  /** Restores the value represented by an unselected control. */
  onDeselect?: () => void;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  "data-test": dataTest,
  "data-property": dataProperty,
  className,
  disabled = false,
  tooltips = false,
  allowDeselect = false,
  onDeselect,
}: SegmentedControlProps<T>): ReactElement {
  const selectedIndex = options.findIndex((option) => option.value === value);
  return (
    <div
      className={`segmented-control${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
      data-test={dataTest}
      data-property={dataProperty}
      style={{ "--segment-count": options.length, "--segment-index": Math.max(0, selectedIndex) } as CSSProperties}
    >
      <span className="segmented-control__indicator" aria-hidden="true" data-hidden={selectedIndex < 0 ? "" : undefined} />
      {options.map((option) => {
        const selected = option.value === value;
        const toggle = (
          <Toggle
            type="button"
            className={`button segmented-control__button${selected ? " segmented-control__button--selected" : ""}`}
            pressed={selected}
            disabled={disabled}
            aria-label={option.label}
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
            {option.icon ?? <span className="segmented-control__label">{option.label}</span>}
          </Toggle>
        );
        return <Fragment key={option.value}>{tooltips ? <Tooltip>{toggle}</Tooltip> : toggle}</Fragment>;
      })}
    </div>
  );
}
