import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Expand, Minimize2, SlidersHorizontal } from "lucide-react";
import { Button } from "./Button.tsx";

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
      {...(hasPairedControls
        ? { "data-expanded": isExpanded ? "true" : "false" }
        : { "data-linked": isLinked ? "true" : "false" })}
    >
      {hasPairedControls ? (
        <>
          <div className="dt-side-values__header">
            <span className="dt-side-values__label">{label}</span>
          </div>
          <div className="dt-side-values__value-row">
            {isExpanded ? (
              <SideControls label={label} sides={sides} />
            ) : (
              <div className="dt-side-values__pairs" role="group" aria-label={`${String(label)} grouped sides`}>
                {pairedControls!.map(({ axis, control }) => (
                  <div
                    className="dt-side-values__side"
                    data-test={`pair-value-${axis}`}
                    data-axis={axis}
                    aria-label={`${String(label)} ${axis === "horizontal" ? "left and right" : "top and bottom"}`}
                    title={`${String(label)} ${axis === "horizontal" ? "left and right" : "top and bottom"}`}
                    key={axis}
                  >
                    <AxisIndicator axis={axis} />
                    <div className="dt-side-values__control">{control}</div>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="quiet"
              size="compact"
              className="dt-side-values__toggle dt-side-values__expand"
              data-test="individual-sides"
              aria-expanded={isExpanded}
              aria-label={forceExpanded
                ? `${String(label)} sides are expanded because values differ`
                : isExpanded ? `Collapse ${String(label)} sides` : `Expand ${String(label)} sides`}
              title={forceExpanded
                ? "Individual sides stay open while values differ"
                : isExpanded ? "Collapse to grouped sides" : "Expand to individual sides"}
              disabled={forceExpanded}
              onClick={toggleExpanded}
            >
              {isExpanded ? <Minimize2 size={16} strokeWidth={1.8} aria-hidden="true" /> : <Expand size={16} strokeWidth={1.8} aria-hidden="true" />}
            </Button>
          </div>
        </>
      ) : isLinked ? (
        <>
          <div className="dt-side-values__header">
            <span className="dt-side-values__label">{label}</span>
            <Button
              variant="quiet"
              size="compact"
              className="dt-side-values__toggle"
              data-test="individual-sides"
              aria-expanded={!isLinked}
              aria-label={`Edit individual ${String(label)} sides`}
              onClick={toggleLinked}
            >
              <SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden="true" />
              Individual sides
            </Button>
          </div>
          <div className="dt-side-values__linked">{linkedControl}</div>
        </>
      ) : (
        <>
          <div className="dt-side-values__header">
            <span className="dt-side-values__label">{label}</span>
            <Button
              variant="quiet"
              size="compact"
              className="dt-side-values__toggle"
              data-test="individual-sides"
              aria-expanded={!isLinked}
              aria-label={`Link ${String(label)} sides`}
              onClick={toggleLinked}
            >
              <SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden="true" />
              Link sides
            </Button>
          </div>
          <SideControls label={label} sides={sides} />
        </>
      )}
    </div>
  );
}

function SideControls({
  label,
  sides,
}: {
  label: ReactNode;
  sides: readonly SideValueSlot[];
}): ReactElement {
  return (
    <div className="dt-side-values__grid" role="group" aria-label={`${String(label)} individual sides`}>
      {sides.map(({ side, control }) => (
        <div
          className="dt-side-values__side"
          data-test={`side-value-${side}`}
          data-side={side}
          aria-label={`${String(label)} ${side}`}
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
