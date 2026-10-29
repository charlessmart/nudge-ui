import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from "react";
import { IconColorPicker } from "@tabler/icons-react";
import { IconButton } from "./IconButton.tsx";
import { Select } from "./Select.tsx";
import { Slider } from "./Slider.tsx";
import {
  COLOR_FORMATS,
  channelLabels,
  channelMax,
  channelValues,
  clamp,
  colorAtSurface,
  formatCssColor,
  formatForValue,
  hexFromHsva,
  hsvaFromRgba,
  parseCssColor,
  parseHex,
  surfaceBackground,
  surfaceModelFor,
  surfacePosition,
  withChannel,
  type ColorFormat,
  type Hsva,
} from "./colorModel.ts";

export interface ColorPickerPanelProps {
  /** Any CSS color; unresolvable values open on black. */
  value: string;
  /** A value whose syntax picks the opening format, when `value` is a resolved form of it. */
  formatHint?: string;
  disabled?: boolean;
  /** Receives each new color in the selected format, at most once a frame while dragging. */
  onChange(value: string): void;
  /** Brackets a surface or slider drag so the caller can group its changes. */
  onDragStateChange?(dragging: boolean): void;
}

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new(): { open(): Promise<EyeDropperResult> };
}

const BLACK: Hsva = { h: 0, s: 0, v: 0, a: 1 };

function eyeDropper(): EyeDropperConstructor | null {
  // SAFETY: EyeDropper is a Chromium-only global missing from the DOM lib; the shape is checked before use.
  const candidate = (globalThis as { EyeDropper?: unknown }).EyeDropper;
  return typeof candidate === "function" ? candidate as EyeDropperConstructor : null;
}

function sameColor(left: Hsva, right: Hsva): boolean {
  return hexFromHsva(left, true) === hexFromHsva(right, true);
}

function fractionWithin(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.width ? (clientX - bounds.left) / bounds.width : 0,
    y: bounds.height ? (clientY - bounds.top) / bounds.height : 0,
  };
}

function arrowStep(event: KeyboardEvent): number {
  return event.shiftKey ? 10 : 1;
}

export function ColorPickerPanel({ value, formatHint, disabled = false, onChange, onDragStateChange }: ColorPickerPanelProps): ReactElement {
  const [format, setFormat] = useState<ColorFormat>(() => formatForValue(formatHint ?? value));
  const [color, setColor] = useState<Hsva>(() => {
    const parsed = parseCssColor(value);
    return parsed ? hsvaFromRgba(parsed) : BLACK;
  });
  const colorRef = useRef(color);
  const formatRef = useRef(format);
  formatRef.current = format;
  const draggingRef = useRef(false);
  const lastEmittedRef = useRef(value);
  const pendingRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const surfaceModel = surfaceModelFor(format);

  // An outside change (undo, another field) moves the picker; its own echoes and in-flight drags do not.
  useEffect(() => {
    if (draggingRef.current || value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const parsed = parseCssColor(value);
    if (!parsed) return;
    const next = hsvaFromRgba(parsed, colorRef.current);
    if (sameColor(next, colorRef.current)) return;
    colorRef.current = next;
    setColor(next);
  }, [value]);

  const flush = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending !== null) onChangeRef.current(pending);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const apply = useCallback((next: Hsva) => {
    colorRef.current = next;
    setColor(next);
    const css = formatCssColor(next, formatRef.current);
    if (css === lastEmittedRef.current) return;
    lastEmittedRef.current = css;
    pendingRef.current = css;
    if (!draggingRef.current) {
      flush();
      return;
    }
    frameRef.current ??= requestAnimationFrame(() => {
      frameRef.current = null;
      flush();
    });
  }, [flush]);

  function setDragging(dragging: boolean): void {
    draggingRef.current = dragging;
    if (!dragging) flush();
    onDragStateChange?.(dragging);
  }

  function startDrag(event: PointerEvent<HTMLElement>, update: (x: number, y: number) => void): void {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    target.focus({ preventScroll: true });
    setDragging(true);
    const move = (clientX: number, clientY: number): void => {
      const { x, y } = fractionWithin(target, clientX, clientY);
      update(x, y);
    };
    move(event.clientX, event.clientY);
    const handleMove = (moveEvent: globalThis.PointerEvent): void => move(moveEvent.clientX, moveEvent.clientY);
    const finish = (): void => {
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      target.removeEventListener("lostpointercapture", finish);
      setDragging(false);
    };
    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
    target.addEventListener("lostpointercapture", finish);
  }

  function handleSurfaceKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = arrowStep(event) / 100;
    const position = surfacePosition(colorRef.current, surfaceModel);
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    apply(colorAtSurface(colorRef.current, surfaceModel, position.x + delta[0]!, position.y + delta[1]!));
  }

  function handleFormatChange(next: string): void {
    const nextFormat = COLOR_FORMATS.find((entry) => entry.value === next)?.value;
    if (!nextFormat) return;
    // Only the next edit writes the new syntax; switching formats to read a value changes nothing.
    setFormat(nextFormat);
  }

  async function handleEyeDropper(): Promise<void> {
    const EyeDropper = eyeDropper();
    if (!EyeDropper || disabled) return;
    try {
      const result = await new EyeDropper().open();
      const parsed = parseHex(result.sRGBHex);
      if (parsed) apply(hsvaFromRgba({ ...parsed, a: colorRef.current.a }, colorRef.current));
    } catch {
      // Escape cancels the eyedropper by rejecting; there is nothing to apply.
    }
  }

  const position = surfacePosition(color, surfaceModel);
  const opaqueHex = hexFromHsva(color, false);
  const hue = Math.round(color.h);
  const alphaPercent = Math.round(color.a * 100);

  return (
    <div className="color-picker" data-test="color-picker-panel" aria-disabled={disabled || undefined}>
      <div
        className="color-picker__surface"
        data-test="color-picker-surface"
        data-model={surfaceModel}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={surfaceModel === "hsl" ? "Saturation and lightness" : "Saturation and brightness"}
        aria-valuetext={formatCssColor(color, format)}
        style={{ background: surfaceBackground(color, surfaceModel) }}
        onPointerDown={(event) => startDrag(event, (x, y) => apply(colorAtSurface(colorRef.current, surfaceModel, x, y)))}
        onKeyDown={handleSurfaceKeyDown}
      >
        <span
          className="color-picker__thumb color-picker__thumb--surface"
          // SAFETY: React CSSProperties permits custom properties through index signatures; only --thumb-color is added.
          style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, "--thumb-color": opaqueHex } as CSSProperties}
        />
      </div>
      <div className="color-picker__slider-row">
        {eyeDropper() ? (
          <IconButton
            variant="quiet"
            label="Pick color from screen"
            data-test="color-picker-eyedropper"
            disabled={disabled}
            onClick={() => void handleEyeDropper()}
          >
            <IconColorPicker size={"var(--icon-size-small)"} stroke={1.6} aria-hidden="true" />
          </IconButton>
        ) : null}
        <div className="color-picker__sliders">
          <ColorSlider
            label="Hue"
            dataTest="color-picker-hue"
            className="color-picker__slider--hue"
            value={hue}
            max={360}
            thumbColor={hexFromHsva({ h: color.h, s: 1, v: 1, a: 1 }, false)}
            disabled={disabled}
            onDragStateChange={setDragging}
            onChange={(x) => apply({ ...colorRef.current, h: x * 360 })}
            onStep={(delta) => apply({ ...colorRef.current, h: clamp(colorRef.current.h + delta, 0, 360) })}
          />
          <ColorSlider
            label="Opacity"
            dataTest="color-picker-alpha"
            className="color-picker__slider--alpha"
            value={alphaPercent}
            max={100}
            valueText={`${alphaPercent}%`}
            thumbColor={formatCssColor(color, "rgb")}
            trackColor={opaqueHex}
            disabled={disabled}
            onDragStateChange={setDragging}
            onChange={(x) => apply({ ...colorRef.current, a: Math.round(x * 100) / 100 })}
            onStep={(delta) => apply({ ...colorRef.current, a: clamp(Math.round(colorRef.current.a * 100) + delta, 0, 100) / 100 })}
          />
        </div>
      </div>
      <div className="color-picker__footer">
        <Select
          className="color-picker__format"
          data-test="color-picker-format"
          aria-label="Color format"
          popupWidth="fit"
          value={format}
          options={COLOR_FORMATS.map((entry) => ({ value: entry.value, label: entry.label }))}
          disabled={disabled}
          onValueChange={handleFormatChange}
        />
        <div className="color-picker__channels" data-test="color-picker-channels" data-format={format}>
          {format === "hex" ? (
            <HexInput color={color} disabled={disabled} onCommit={apply} />
          ) : channelValues(color, format).map((channel, index) => (
            <NumberCell
              key={`${format}-${index}`}
              label={channelLabels(format)[index]!}
              dataTest={`color-picker-channel-${index}`}
              value={channel}
              max={channelMax(format, index)}
              disabled={disabled}
              onCommit={(next) => apply(withChannel(colorRef.current, format, index, next))}
            />
          ))}
          {/* The unit belongs to the field: clicking it focuses the input and the focus ring wraps both. */}
          <label className="color-picker__alpha">
            <NumberCell
              label="Opacity"
              dataTest="color-picker-alpha-input"
              className="color-picker__cell--alpha"
              value={alphaPercent}
              max={100}
              disabled={disabled}
              onCommit={(next) => apply({ ...colorRef.current, a: next / 100 })}
            />
            <span className="color-picker__unit" aria-hidden="true">%</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function ColorSlider({
  label,
  dataTest,
  className,
  value,
  max,
  valueText,
  thumbColor,
  trackColor,
  disabled,
  onChange,
  onStep,
  onDragStateChange,
}: {
  label: string;
  dataTest: string;
  className: string;
  value: number;
  max: number;
  valueText?: string;
  thumbColor: string;
  trackColor?: string;
  disabled: boolean;
  /** A rail position from 0 to 1. */
  onChange(position: number): void;
  onStep(delta: number): void;
  onDragStateChange(dragging: boolean): void;
}): ReactElement {
  return (
    <Slider
      label={label}
      dataTest={dataTest}
      className={`color-picker__slider ${className}`}
      position={value / max}
      valueMin={0}
      valueMax={max}
      valueNow={value}
      valueText={valueText}
      disabled={disabled}
      // SAFETY: React CSSProperties permits custom properties through index signatures; only the slider colors are added.
      style={{ "--thumb-color": thumbColor, "--track-color": trackColor } as CSSProperties}
      onChange={onChange}
      onStep={(direction, large) => onStep(direction * (large ? 10 : 1))}
      onDragStateChange={onDragStateChange}
    />
  );
}

/** A channel that shows its committed value until edited; Enter or blur commits, Escape restores. */
function NumberCell({
  label,
  dataTest,
  className,
  value,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  dataTest: string;
  className?: string;
  value: number;
  max: number;
  disabled: boolean;
  onCommit(value: number): void;
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(): void {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) onCommit(clamp(Math.round(parsed), 0, max));
  }

  return (
    <input
      className={`color-picker__cell${className ? ` ${className}` : ""}`}
      data-test={dataTest}
      type="text"
      inputMode="numeric"
      aria-label={label}
      disabled={disabled}
      value={draft ?? String(value)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          const base = Number.parseFloat(draft ?? String(value));
          setDraft(null);
          onCommit(clamp((Number.isFinite(base) ? base : value) + (event.key === "ArrowUp" ? 1 : -1) * arrowStep(event), 0, max));
        } else if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape" && draft !== null) {
          // The first Escape abandons the edit; the next closes the picker.
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

function HexInput({ color, disabled, onCommit }: { color: Hsva; disabled: boolean; onCommit(color: Hsva): void }): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = hexFromHsva(color, false).slice(1).toUpperCase();

  function commit(): void {
    if (draft === null) return;
    setDraft(null);
    const parsed = parseHex(draft);
    // Eight digits carry their own alpha; shorter forms keep the current opacity.
    if (parsed) onCommit(hsvaFromRgba({ ...parsed, a: draft.replace("#", "").length === 8 ? parsed.a : color.a }, color));
  }

  return (
    <input
      className="color-picker__cell color-picker__cell--hex"
      data-test="color-picker-hex"
      type="text"
      spellCheck={false}
      autoComplete="off"
      aria-label="Hex color"
      disabled={disabled}
      value={draft ?? shown}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape" && draft !== null) {
          // The first Escape abandons the edit; the next closes the picker.
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
