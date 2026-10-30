import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from "react";
import { RollingText } from "./RollingText.tsx";
import { stretchSlider } from "./sliderStretch.ts";

export interface SliderProps {
  label: string;
  /** Where the thumb sits, 0 at the start of the rail and 1 at its end. */
  position: number;
  valueMin: number;
  valueMax: number;
  valueNow: number;
  valueText?: string;
  /** Shown just above the thumb, rolling up to each new value; leave out for no label. */
  valueLabel?: string;
  className?: string;
  dataTest?: string;
  /** Fills the rail from its start up to the thumb. */
  filled?: boolean;
  disabled?: boolean;
  /** Custom properties the caller's own styles read, such as the rail and thumb colors. */
  style?: CSSProperties;
  /** A press, drag or Home/End, as a rail position from 0 to 1. */
  onChange(position: number): void;
  /** An arrow key; `large` while Shift is held. */
  onStep(direction: 1 | -1, large: boolean): void;
  /** Brackets a drag so the caller can group its changes. */
  onDragStateChange?(dragging: boolean): void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A thick pill rail with a round thumb; dragging past an end stretches the rail elastically and springs back on release. */
export function Slider({
  label,
  position,
  valueMin,
  valueMax,
  valueNow,
  valueText,
  valueLabel,
  className,
  dataTest,
  filled = false,
  disabled = false,
  style,
  onChange,
  onStep,
  onDragStateChange,
}: SliderProps): ReactElement {
  const dragging = useRef(false);

  function move(slider: HTMLElement, clientX: number): void {
    // Measured on the slider itself, which is the rail inset by half a thumb, so the thumb's center reaches each end.
    const rect = slider.getBoundingClientRect();
    onChange(clamp01(rect.width ? (clientX - rect.left) / rect.width : 0));
    stretchSlider(slider, clientX);
  }

  function endDrag(slider: HTMLElement): void {
    if (!dragging.current) return;
    dragging.current = false;
    stretchSlider(slider, null);
    onDragStateChange?.(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (disabled || event.button !== 0) return;
    // The press focuses the slider natively, so it reads as a pointer focus and shows no keyboard ring.
    const slider = event.currentTarget;
    slider.setPointerCapture(event.pointerId);
    dragging.current = true;
    onDragStateChange?.(true);
    move(slider, event.clientX);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return;
    const large = event.shiftKey;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") onStep(1, large);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") onStep(-1, large);
    else if (event.key === "Home") onChange(0);
    else if (event.key === "End") onChange(1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className={className ? `slider ${className}` : "slider"}
      data-test={dataTest}
      data-filled={filled ? "" : undefined}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      // SAFETY: React CSSProperties permits custom properties through index signatures; only --slider-position is added.
      style={{ ...style, "--slider-position": clamp01(position) } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => {
        if (dragging.current && event.currentTarget.hasPointerCapture(event.pointerId)) move(event.currentTarget, event.clientX);
      }}
      onPointerUp={(event) => endDrag(event.currentTarget)}
      onPointerCancel={(event) => endDrag(event.currentTarget)}
      onLostPointerCapture={(event) => endDrag(event.currentTarget)}
      onKeyDown={handleKeyDown}
    >
      {filled ? <span className="slider__fill" aria-hidden="true" /> : null}
      <span className="slider__thumb" aria-hidden="true" />
      {valueLabel === undefined ? null : (
        <span className="slider__value" aria-hidden="true"><RollingText value={valueLabel} /></span>
      )}
    </div>
  );
}
