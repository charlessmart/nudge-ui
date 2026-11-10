import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
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
  /** Inactive options show only their icon; the selected one also shows its label. */
  showSelectedLabel?: boolean;
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
  showSelectedLabel = false,
  allowDeselect = false,
  onDeselect,
}: SegmentedControlProps<T>): ReactElement {
  const selectedIndex = options.findIndex((option) => option.value === value);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelKey = options.map((option) => option.label).join("\n");
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!showSelectedLabel || !root) return;
    return measureRevealLabels(root);
  }, [showSelectedLabel, labelKey]);
  return (
    <div
      ref={rootRef}
      className={`segmented-control${showSelectedLabel ? " segmented-control--reveal" : ""}${className ? ` ${className}` : ""}`}
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
            {showSelectedLabel && option.icon ? (
              // Every label stays mounted so the selected one can unfold while the previous one folds away.
              <>
                {option.icon}
                <span className="segmented-control__label">{option.label}</span>
              </>
            ) : option.icon ?? <span className="segmented-control__label">{option.label}</span>}
          </Toggle>
        );
        return <Fragment key={option.value}>{tooltips ? <Tooltip>{toggle}</Tooltip> : toggle}</Fragment>;
      })}
    </div>
  );
}

/**
 * Publishes each label's natural width as `--label-width` on its segment, so CSS can centre the opened segment's icon
 * and label with padding that animates on the same curve as the segment's width. Labels are clipped while folded, so
 * `scrollWidth` reads the full text; webfonts can change it once they load. A control that mounts hidden (the editor
 * opens with its panel collapsed after a refresh) measures zero, so it measures again whenever it is resized.
 */
function measureRevealLabels(root: HTMLElement): () => void {
  let cancelled = false;
  const measure = (): void => {
    if (cancelled) return;
    for (const label of root.querySelectorAll<HTMLElement>(".segmented-control__label")) {
      label.parentElement?.style.setProperty("--label-width", `${label.scrollWidth}px`);
    }
  };
  measure();
  void root.ownerDocument.fonts?.ready.then(measure);
  const view = root.ownerDocument.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
  observer?.observe(root);
  return () => {
    cancelled = true;
    observer?.disconnect();
  };
}
