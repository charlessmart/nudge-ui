import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { ControlSurface } from "./ControlSurface.tsx";
import { IconButton } from "./IconButton.tsx";
import { TextInput } from "./TextInput.tsx";

export interface StepperProps {
  /** Current value; null renders an empty readout until stepped or typed into. */
  value: number | null;
  min?: number;
  max?: number;
  ariaLabel: string;
  /** Optional muted prefix rendered before the readout (e.g. "×" for spans). */
  prefix?: string;
  onChange: (next: number) => void;
  "data-test"?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Numeric stepper for small bounded integers. Buttons step and clamp; the
 * readout also accepts a typed number committed on blur or Enter.
 */
export function Stepper({
  value,
  min = 1,
  max = 12,
  ariaLabel,
  prefix,
  onChange,
  "data-test": dataTest,
}: StepperProps): ReactElement {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  // Blur commits read the ref, not state: Escape resets the draft and then
  // blurs within the same event, before React re-renders, so state alone
  // would let blur commit the pre-escape draft.
  const draftRef = useRef(draft);

  useEffect(() => {
    updateDraft(value === null ? "" : String(value));
  }, [value]);

  function updateDraft(next: string): void {
    draftRef.current = next;
    setDraft(next);
  }

  function commitDraft(): void {
    const parsed = Number.parseInt(draftRef.current, 10);
    if (Number.isNaN(parsed)) {
      resetDraft();
      return;
    }
    const next = clamp(parsed, min, max);
    updateDraft(String(next));
    if (next !== value) onChange(next);
  }

  function resetDraft(): void {
    updateDraft(value === null ? "" : String(value));
  }

  function step(delta: number): void {
    const next = clamp((value ?? min) + delta, min, max);
    if (next !== value) onChange(next);
  }

  return (
    <ControlSurface className="stepper" data-test={dataTest}>
      <IconButton
        variant="quiet"
        size="compact"
        className="stepper__button"
        label={`Decrease ${ariaLabel}`}
        aria-label={`Decrease ${ariaLabel}`}
        data-test={dataTest ? `${dataTest}-decrement` : undefined}
        disabled={value !== null && value <= min}
        onClick={() => step(-1)}
      >
        <IconMinus size={12} stroke={2.2} aria-hidden="true" />
      </IconButton>
      {prefix ? <span className="stepper__prefix" aria-hidden="true">{prefix}</span> : null}
      <TextInput
        className="stepper__value"
        appearance="embedded"
        value={draft}
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="–"
        data-test={dataTest ? `${dataTest}-value` : undefined}
        onChange={(event) => updateDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            resetDraft();
            event.currentTarget.blur();
          }
        }}
      />
      <IconButton
        variant="quiet"
        size="compact"
        className="stepper__button"
        label={`Increase ${ariaLabel}`}
        aria-label={`Increase ${ariaLabel}`}
        data-test={dataTest ? `${dataTest}-increment` : undefined}
        disabled={value !== null && value >= max}
        onClick={() => step(1)}
      >
        <IconPlus size={12} stroke={2.2} aria-hidden="true" />
      </IconButton>
    </ControlSurface>
  );
}
