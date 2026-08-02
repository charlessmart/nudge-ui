import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconBorderSides, IconPlus } from "@tabler/icons-react";
import { IconButton } from "./IconButton.tsx";
import { formatInspectorLabel } from "./labels.ts";

export const SIDE_NAMES = ["top", "right", "bottom", "left"] as const;
export type SideName = (typeof SIDE_NAMES)[number];

export interface SideValueSlot {
  side: SideName;
  control: ReactNode;
}

export type SideValueAxis = "horizontal" | "vertical";

export interface SideValuePairSlot {
  axis: SideValueAxis;
  control: ReactNode;
}

export interface SideValuesFieldProps {
  label: ReactNode;
  linkedControl?: ReactNode;
  sides: readonly SideValueSlot[];
  pairedControls?: readonly SideValuePairSlot[];
  defaultLinked?: boolean;
  linked?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
  expanded?: boolean;
  showLabel?: boolean;
  empty?: boolean;
  onAdd?: () => void;
  resetKey?: unknown;
  onLinkedChange?: (linked: boolean) => void;
  onExpandedChange?: (expanded: boolean) => void;
  "data-test"?: string;
  "data-property"?: string;
}

/**
 * A compact side editor. Callers can provide either a linked/four-side mode or
 * grouped horizontal/vertical controls that expand into the four physical
 * sides. The field owns presentation and mode state while callers own the
 * actual CSS/token controls rendered in each slot.
 */
export function SideValuesField({
  label,
  linkedControl,
  sides,
  pairedControls,
  defaultLinked = true,
  linked: controlledLinked,
  defaultExpanded = false,
  forceExpanded = false,
  expanded: controlledExpanded,
  showLabel = true,
  empty = false,
  onAdd,
  resetKey,
  onLinkedChange,
  onExpandedChange,
  "data-test": dataTest,
  "data-property": dataProperty,
}: SideValuesFieldProps): ReactElement {
  const [uncontrolledLinked, setUncontrolledLinked] = useState(defaultLinked);
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const previousResetKey = useRef(resetKey);
  const isControlled = controlledLinked !== undefined;
  const isLinked = controlledLinked ?? uncontrolledLinked;
  const isExpandedControlled = controlledExpanded !== undefined;
  const isResetting = previousResetKey.current !== resetKey;
  const isExpanded = forceExpanded || (!isExpandedControlled && isResetting
    ? defaultExpanded
    : controlledExpanded ?? uncontrolledExpanded);
  const hasPairedControls = Boolean(pairedControls && pairedControls.length > 0);
  const labelText = typeof label === "string" ? formatInspectorLabel(label) : String(label);
  const displayLabel = showLabel ? (typeof label === "string" ? labelText : label) : null;

  useEffect(() => {
    // `defaultLinked` describes the newly selected element, not the current
    // edit. Keep an explicit user choice stable while token rows refresh.
    if (!isControlled) setUncontrolledLinked(defaultLinked);
  }, [isControlled, resetKey]);

  useEffect(() => {
    if (!isExpandedControlled) setUncontrolledExpanded(defaultExpanded);
    previousResetKey.current = resetKey;
  }, [isExpandedControlled, resetKey]);

  function toggleLinked(): void {
    const next = !isLinked;
    if (!isControlled) setUncontrolledLinked(next);
    onLinkedChange?.(next);
  }

  function toggleExpanded(): void {
    if (forceExpanded) return;
    const next = !isExpanded;
    if (!isExpandedControlled) setUncontrolledExpanded(next);
    onExpandedChange?.(next);
  }

  return (
    <div
      className="dt-side-values"
      data-test={dataTest}
      data-property={dataProperty}
      data-empty={empty ? "true" : undefined}
      {...(hasPairedControls
        ? { "data-expanded": isExpanded ? "true" : "false" }
        : { "data-linked": isLinked ? "true" : "false" })}
    >
      {empty ? (
        <div className="dt-side-values__header">
          <span className="dt-side-values__label">{displayLabel}</span>
          <IconButton
            variant="quiet"
            size="default"
            data-test="add-value"
            label={`Add ${labelText}`}
            title={`Add ${labelText}`}
            onClick={onAdd}
          >
            <IconPlus size={16} stroke={1.8} aria-hidden="true" />
          </IconButton>
        </div>
      ) : hasPairedControls ? (
        <>
          {showLabel ? (
            <div className="dt-side-values__header">
              <span className="dt-side-values__label">{displayLabel}</span>
            </div>
          ) : null}
          <div className="dt-side-values__value-row">
            {isExpanded ? (
              <SideControls label={label} sides={sides} />
            ) : (
              <div className="dt-side-values__pairs" role="group" aria-label={`${labelText} Grouped Sides`}>
                {pairedControls!.map(({ axis, control }) => (
                  <div
                    className="dt-side-values__side"
                    data-test={`pair-value-${axis}`}
                    data-axis={axis}
                    aria-label={`${labelText} ${axis === "horizontal" ? "Left And Right" : "Top And Bottom"}`}
                    title={`${labelText} ${axis === "horizontal" ? "Left And Right" : "Top And Bottom"}`}
                    key={axis}
                  >
                    <AxisIndicator axis={axis} />
                    <div className="dt-side-values__control">{control}</div>
                  </div>
                ))}
              </div>
            )}
            <IconButton
              variant="quiet"
              size="default"
              data-test="individual-sides"
              label={forceExpanded
                ? `${labelText} Sides Are Expanded Because Values Differ`
                : isExpanded ? `Collapse ${labelText} Sides` : `Expand ${labelText} Sides`}
              title={forceExpanded
                ? "Individual Sides Stay Open While Values Differ"
                : isExpanded ? "Collapse To Grouped Sides" : "Expand To Individual Sides"}
              disabled={forceExpanded}
              aria-pressed={isExpanded}
              data-active={isExpanded}
              onClick={toggleExpanded}
            >
              <IconBorderSides size={16} stroke={1.8} aria-hidden="true" />
            </IconButton>
          </div>
        </>
      ) : isLinked ? (
        <div className={`dt-side-values__value-row dt-side-values__linked-row${showLabel ? "" : " dt-side-values__linked-row--no-label"}`}>
          {showLabel ? <span className="dt-side-values__label">{displayLabel}</span> : null}
          <div className="dt-side-values__linked">{linkedControl}</div>
          <IconButton
            variant="quiet"
            size="default"
            data-test="individual-sides"
            label={`Edit Individual ${labelText} Sides`}
            title={`Edit Individual ${labelText} Sides`}
            aria-pressed={!isLinked}
            data-active={!isLinked}
            onClick={toggleLinked}
          >
            <IconBorderSides size={16} stroke={1.8} aria-hidden="true" />
          </IconButton>
        </div>
      ) : (
        <>
          <div className="dt-side-values__header">
            <span className="dt-side-values__label">{displayLabel}</span>
            <IconButton
              variant="quiet"
              size="default"
              data-test="individual-sides"
              label={`Link ${labelText} Sides`}
              title={`Link ${labelText} Sides`}
              aria-pressed={!isLinked}
              data-active={!isLinked}
              onClick={toggleLinked}
            >
              <IconBorderSides size={16} stroke={1.8} aria-hidden="true" />
            </IconButton>
          </div>
          <SideControls label={label} sides={sides} />
        </>
      )}
    </div>
  );
}

export function SideControls({
  label,
  sides,
}: {
  label: ReactNode;
  sides: readonly SideValueSlot[];
}): ReactElement {
  return (
    <div className="dt-side-values__grid" role="group" aria-label={`${typeof label === "string" ? formatInspectorLabel(label) : String(label)} Individual Sides`}>
      {sides.map(({ side, control }) => (
        <div
          className="dt-side-values__side"
          data-test={`side-value-${side}`}
          data-side={side}
          aria-label={`${typeof label === "string" ? formatInspectorLabel(label) : String(label)} ${formatInspectorLabel(side)}`}
          key={side}
        >
          <SideIndicator side={side} />
          <div className="dt-side-values__control">{control}</div>
        </div>
      ))}
    </div>
  );
}

function AxisIndicator({ axis }: { axis: SideValueAxis }): ReactElement {
  const emphasis = axis === "horizontal"
    ? <><path d="M5 4v8" /><path d="M11 4v8" /></>
    : <><path d="M4 5h8" /><path d="M4 11h8" /></>;

  return (
    <svg className="dt-side-values__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
      <g className="dt-side-values__icon-emphasis">{emphasis}</g>
    </svg>
  );
}

function SideIndicator({ side }: { side: SideName }): ReactElement {
  const emphasis = {
    top: "M4 4h8",
    right: "M12 4v8",
    bottom: "M4 12h8",
    left: "M4 4v8",
  }[side];

  return (
    <svg className="dt-side-values__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
      <path d={emphasis} className="dt-side-values__icon-emphasis" />
    </svg>
  );
}
