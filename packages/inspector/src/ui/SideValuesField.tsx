import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconBorderSides, IconPlus } from "@tabler/icons-react";
import { IconButton } from "./IconButton.tsx";
import { ToggleButton } from "./ToggleButton.tsx";
import { formatInspectorLabel } from "./labels.ts";
import { ControlSurface } from "./ControlSurface.tsx";

export const SIDE_NAMES = ["top", "right", "bottom", "left"] as const;
export type SideName = (typeof SIDE_NAMES)[number];
export type SideValueAxis = "horizontal" | "vertical";
export type SideControlsLayout = "sides" | "corners";

const SIDE_DISPLAY_ORDER: readonly SideName[] = ["left", "top", "right", "bottom"];
const SIDE_AXIS_DISPLAY_ORDER: readonly SideValueAxis[] = ["horizontal", "vertical"];

export interface SideValueSlot {
  side: SideName;
  control: ReactNode;
  icon?: ReactNode;
  sideLabel?: string;
}

export interface SideValuePairSlot {
  axis: SideValueAxis;
  control: ReactNode;
  icon?: ReactNode;
}

export interface SideValuesFieldProps {
  label: ReactNode;
  sides: readonly SideValueSlot[];
  pairedControls?: readonly SideValuePairSlot[];
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
  showLabel?: boolean;
  empty?: boolean;
  onAdd?: () => void;
  emptyAction?: ReactNode;
  resetKey?: unknown;
  "data-test"?: string;
  "data-property"?: string;
}

/**
 * A compact side editor. Callers provide grouped horizontal/vertical controls
 * that expand into the four physical sides (or omit `pairedControls` to show
 * the four sides directly). The field owns presentation and expand state
 * while callers own the actual CSS/token controls rendered in each slot.
 */
export function SideValuesField({
  label,
  sides,
  pairedControls,
  defaultExpanded = false,
  forceExpanded = false,
  showLabel = true,
  empty = false,
  onAdd,
  emptyAction,
  resetKey,
  "data-test": dataTest,
  "data-property": dataProperty,
}: SideValuesFieldProps): ReactElement {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const previousResetKey = useRef(resetKey);
  const isResetting = previousResetKey.current !== resetKey;
  const isExpanded = forceExpanded || (isResetting ? defaultExpanded : uncontrolledExpanded);
  const hasPairedControls = Boolean(pairedControls && pairedControls.length > 0);
  const orderedPairedControls = SIDE_AXIS_DISPLAY_ORDER
    .map((axis) => pairedControls?.find((pair) => pair.axis === axis))
    .filter((pair): pair is SideValuePairSlot => pair !== undefined);
  const labelText = typeof label === "string" ? formatInspectorLabel(label) : String(label);
  const displayLabel = showLabel ? (typeof label === "string" ? labelText : label) : null;

  useEffect(() => {
    // `defaultExpanded` describes the newly selected element, not the current
    // edit; reseed when the selection (resetKey) changes.
    setUncontrolledExpanded(defaultExpanded);
    previousResetKey.current = resetKey;
  }, [resetKey]);

  function toggleExpanded(): void {
    if (forceExpanded) return;
    setUncontrolledExpanded(!isExpanded);
  }

  return (
    <div
      className="side-values"
      data-test={dataTest}
      data-property={dataProperty}
      data-empty={empty ? "true" : undefined}
      {...(hasPairedControls
        ? { "data-expanded": isExpanded ? "true" : "false" }
        : {})}
    >
      {empty ? (
        <div className="side-values__header">
          <span className="side-values__label">{displayLabel}</span>
          {emptyAction ?? (
            <IconButton
              variant="quiet"
              size="default"
              data-test="add-value"
              label={`Add ${labelText}`}
              title={`Add ${labelText}`}
              onClick={onAdd}
            >
              <IconPlus size={16} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      ) : hasPairedControls ? (
        <>
          {showLabel ? (
            <div className="side-values__header">
              <span className="side-values__label">{displayLabel}</span>
            </div>
          ) : null}
          <div className="side-values__value-row">
            {isExpanded ? (
              <SideControls label={label} sides={sides} />
            ) : (
              <div className="side-values__pairs" role="group" aria-label={`${labelText} Grouped Sides`}>
                {orderedPairedControls.map(({ axis, control, icon }) => (
                  <ControlSurface
                    className="side-values__side"
                    data-test={`pair-value-${axis}`}
                    data-axis={axis}
                    aria-label={`${labelText} ${axis === "horizontal" ? "Left And Right" : "Top And Bottom"}`}
                    title={`${labelText} ${axis === "horizontal" ? "Left And Right" : "Top And Bottom"}`}
                    key={axis}
                  >
                    {icon ?? <AxisIndicator axis={axis} />}
                    <div className="side-values__control">{control}</div>
                  </ControlSurface>
                ))}
              </div>
            )}
            <ToggleButton
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
              pressed={isExpanded}
              onPressedChange={toggleExpanded}
            >
              <IconBorderSides size={16} aria-hidden="true" />
            </ToggleButton>
          </div>
        </>
      ) : (
        <>
          {showLabel ? (
            <div className="side-values__header">
              <span className="side-values__label">{displayLabel}</span>
            </div>
          ) : null}
          <SideControls label={label} sides={sides} />
        </>
      )}
    </div>
  );
}

export function SideControls({
  label,
  sides,
  layout = "sides",
}: {
  label: ReactNode;
  sides: readonly SideValueSlot[];
  layout?: SideControlsLayout;
}): ReactElement {
  const displayOrder = layout === "corners" ? SIDE_NAMES : SIDE_DISPLAY_ORDER;
  const orderedSides = displayOrder
    .map((side) => sides.find((slot) => slot.side === side))
    .filter((slot): slot is SideValueSlot => slot !== undefined);
  const labelText = typeof label === "string" ? formatInspectorLabel(label) : String(label);
  const itemGroupLabel = layout === "corners" ? "Individual Corners" : "Individual Sides";

  return (
    <div className="side-values__grid" data-layout={layout} role="group" aria-label={`${labelText} ${itemGroupLabel}`}>
      {orderedSides.map(({ side, control, icon, sideLabel }) => (
        <ControlSurface
          className="side-values__side"
          data-test={`side-value-${side}`}
          data-side={side}
          aria-label={`${labelText} ${sideLabel ?? formatInspectorLabel(side)}`}
          key={side}
        >
          {icon ?? <SideIndicator side={side} />}
          <div className="side-values__control">{control}</div>
        </ControlSurface>
      ))}
    </div>
  );
}

function AxisIndicator({ axis }: { axis: SideValueAxis }): ReactElement {
  const emphasis = axis === "horizontal"
    ? <><path d="M5 4v8" /><path d="M11 4v8" /></>
    : <><path d="M4 5h8" /><path d="M4 11h8" /></>;

  return (
    <svg className="side-values__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
      <g className="side-values__icon-emphasis">{emphasis}</g>
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
    <svg className="side-values__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
      <path d={emphasis} className="side-values__icon-emphasis" />
    </svg>
  );
}

export function MarginSideIndicator({ side }: { side: SideName }): ReactElement {
  if (side === "left") {
    return (
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="7" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="3" y1="5" x2="3" y2="19" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "right") {
    return (
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="21" y1="5" x2="21" y2="19" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "top") {
    return (
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="19" y="7" width="14" height="14" rx="2" transform="rotate(90 19 7)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="19" y1="3" x2="5" y2="3" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="19" y="3" width="14" height="14" rx="2" transform="rotate(90 19 3)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
      <line x1="19" y1="21" x2="5" y2="21" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
    </svg>
  );
}
