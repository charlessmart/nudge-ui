import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "./Button.tsx";

export const SIDE_NAMES = ["top", "right", "bottom", "left"] as const;
export type SideName = (typeof SIDE_NAMES)[number];

export interface SideValueSlot {
  side: SideName;
  control: ReactNode;
}

export interface SideValuesFieldProps {
  label: ReactNode;
  linkedControl: ReactNode;
  sides: readonly SideValueSlot[];
  defaultLinked?: boolean;
  linked?: boolean;
  resetKey?: unknown;
  onLinkedChange?: (linked: boolean) => void;
  "data-test"?: string;
  "data-property"?: string;
}

/**
 * A compact four-side editor. It owns the presentation and mode switch while
 * callers keep ownership of the actual CSS/token fields rendered in each slot.
 */
export function SideValuesField({
  label,
  linkedControl,
  sides,
  defaultLinked = true,
  linked: controlledLinked,
  resetKey,
  onLinkedChange,
  "data-test": dataTest,
  "data-property": dataProperty,
}: SideValuesFieldProps): ReactElement {
  const [uncontrolledLinked, setUncontrolledLinked] = useState(defaultLinked);
  const isControlled = controlledLinked !== undefined;
  const isLinked = controlledLinked ?? uncontrolledLinked;

  useEffect(() => {
    // `defaultLinked` describes the newly selected element, not the current
    // edit. Keep an explicit user choice stable while token rows refresh.
    if (!isControlled) setUncontrolledLinked(defaultLinked);
  }, [isControlled, resetKey]);

  function toggleLinked(): void {
    const next = !isLinked;
    if (!isControlled) setUncontrolledLinked(next);
    onLinkedChange?.(next);
  }

  return (
    <div
      className="dt-side-values"
      data-test={dataTest}
      data-property={dataProperty}
      data-linked={isLinked ? "true" : "false"}
    >
      <div className="dt-side-values__header">
        <span className="dt-side-values__label">{label}</span>
        <Button
          variant="quiet"
          size="compact"
          className="dt-side-values__toggle"
          data-test="individual-sides"
          aria-expanded={!isLinked}
          aria-label={isLinked ? `Edit individual ${String(label)} sides` : `Link ${String(label)} sides`}
          onClick={toggleLinked}
        >
          <SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden="true" />
          {isLinked ? "Individual sides" : "Link sides"}
        </Button>
      </div>

      {isLinked ? (
        <div className="dt-side-values__linked">{linkedControl}</div>
      ) : (
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
      )}
    </div>
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
