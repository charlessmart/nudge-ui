import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconChevronDown, IconSquare } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import {
  setSketchDrawingTool,
  setSketchStrokeColor,
  useSketchDrawingTools,
  type SketchDrawingTool,
} from "../sketch/drawingTools.ts";
import { SKETCH_STROKE_COLORS, type SketchStrokeColor } from "../sketch/model.ts";

/** Matches the `width` transition in CanvasToolbar.css. */
const SLIDE_DURATION_MS = 220;

const COLOR_NAMES: Readonly<Record<(typeof SKETCH_STROKE_COLORS)[number], string>> = {
  "#f03e1e": "Red",
  "#ff8a00": "Orange",
  "#ffc800": "Yellow",
  "#1fc85a": "Green",
  "#0096ff": "Blue",
};

function colorName(color: SketchStrokeColor): string {
  return color in COLOR_NAMES ? COLOR_NAMES[color as keyof typeof COLOR_NAMES] : color;
}

// The toolbar is remounted when sketching moves it into a root-level portal.
// Remember the last state so the new instance can animate from it.
let lastOpen = false;

function PenIllustration({ color }: { readonly color: SketchStrokeColor }): ReactElement {
  const id = useId();
  return (
    <svg className="sketch-options__illustration" viewBox="0 0 28 56" width={28} height={56} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d4d4d4" />
          <stop offset="0.4" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c8c8c8" />
        </linearGradient>
      </defs>
      <path d="M14 2 L16.4 10 H11.6 Z" fill="#1c1c1c" />
      <path d="M11.6 10 H16.4 L21 24 H7 Z" fill={`url(#${id}-body)`} stroke="rgba(0,0,0,0.12)" strokeWidth={0.75} strokeLinejoin="round" />
      <rect x={7} y={23.5} width={14} height={3} fill={color} />
      <rect x={7} y={26.5} width={14} height={34} fill={`url(#${id}-body)`} stroke="rgba(0,0,0,0.12)" strokeWidth={0.75} />
    </svg>
  );
}

function EraserIllustration(): ReactElement {
  const id = useId();
  return (
    <svg className="sketch-options__illustration" viewBox="0 0 28 56" width={28} height={56} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sleeve`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#cfcfcf" />
          <stop offset="0.4" stopColor="#f7f7f7" />
          <stop offset="1" stopColor="#c2c2c2" />
        </linearGradient>
      </defs>
      <rect x={6} y={7} width={16} height={22} rx={4} fill="#f2939a" />
      <rect x={8.5} y={9.5} width={3} height={15} rx={1.5} fill="#ffffff" opacity={0.4} />
      <rect x={5} y={26} width={18} height={34} rx={2} fill={`url(#${id}-sleeve)`} stroke="rgba(0,0,0,0.12)" strokeWidth={0.75} />
      <path d="M5 30.5 H23 M5 33.5 H23" stroke="rgba(0,0,0,0.12)" strokeWidth={0.75} />
    </svg>
  );
}

function IllustratedToolButton({
  tool,
  activeTool,
  label,
  hidden,
  children,
}: {
  readonly tool: SketchDrawingTool;
  readonly activeTool: SketchDrawingTool;
  readonly label: string;
  readonly hidden: boolean;
  readonly children: ReactElement;
}): ReactElement {
  const active = tool === activeTool;
  return (
    <Tooltip content={label} stableTrigger>
      <button
        type="button"
        className="sketch-options__illustrated"
        aria-label={label}
        aria-pressed={active}
        data-active={active ? "true" : "false"}
        data-test={`sketch-tool-${tool}`}
        tabIndex={hidden ? -1 : undefined}
        onClick={() => setSketchDrawingTool(tool)}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ColorPicker({ color, hidden }: { readonly color: SketchStrokeColor; readonly hidden: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="sketch-options__color" ref={rootRef}>
      <Tooltip content="Color" disabled={open} stableTrigger>
        <button
          type="button"
          className="sketch-options__color-trigger"
          aria-label={`Color: ${colorName(color)}`}
          aria-expanded={open}
          data-open={open ? "true" : "false"}
          data-test="sketch-tool-color"
          tabIndex={hidden ? -1 : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="sketch-options__swatch" style={{ background: color }} />
          <IconChevronDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        </button>
      </Tooltip>
      {open ? (
        <div className="sketch-options__palette" role="group" aria-label="Pen color" data-test="sketch-color-palette">
          {SKETCH_STROKE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className="sketch-options__palette-option"
              aria-label={COLOR_NAMES[option]}
              aria-pressed={option === color}
              data-active={option === color ? "true" : "false"}
              data-test={`sketch-color-${COLOR_NAMES[option].toLowerCase()}`}
              onClick={() => {
                setSketchStrokeColor(option);
                setOpen(false);
              }}
            >
              <span className="sketch-options__swatch" style={{ background: option }} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Pen, eraser, color and rectangle controls that slide out beside the sketch tool. */
export function SketchToolOptions({ open }: { readonly open: boolean }): ReactElement {
  const drawing = useSketchDrawingTools();
  const [expanded, setExpanded] = useState(lastOpen);
  const [settled, setSettled] = useState(lastOpen && open);
  const [contentWidth, setContentWidth] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    setContentWidth(inner.offsetWidth);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => setContentWidth(inner.offsetWidth));
    observer?.observe(inner);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    lastOpen = open;
    if (!open) setSettled(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Wait a frame so a freshly mounted toolbar paints its previous state first.
    const frame = requestAnimationFrame(() => {
      setExpanded(open);
      if (open) timer = setTimeout(() => setSettled(true), SLIDE_DURATION_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [open]);

  const hidden = !open;
  return (
    <div
      className="sketch-options"
      role="group"
      aria-label="Sketch tools"
      aria-hidden={hidden}
      data-expanded={expanded ? "true" : "false"}
      data-settled={settled ? "true" : "false"}
      data-test="sketch-tool-options"
      style={{ width: expanded ? contentWidth : 0 }}
    >
      <div className="sketch-options__inner" ref={innerRef}>
        <IllustratedToolButton tool="pen" activeTool={drawing.tool} label="Pen" hidden={hidden}>
          <PenIllustration color={drawing.color} />
        </IllustratedToolButton>
        <IllustratedToolButton tool="eraser" activeTool={drawing.tool} label="Eraser" hidden={hidden}>
          <EraserIllustration />
        </IllustratedToolButton>
        <ColorPicker color={drawing.color} hidden={hidden || !settled} />
        <Tooltip content="Rectangle" stableTrigger>
          <IconButton
            variant="quiet"
            size="large"
            className="canvas-toolbar__tool"
            label="Rectangle"
            aria-pressed={drawing.tool === "rectangle"}
            data-active={drawing.tool === "rectangle" ? "true" : "false"}
            data-test="sketch-tool-rectangle"
            tabIndex={hidden ? -1 : undefined}
            onClick={() => setSketchDrawingTool("rectangle")}
          >
            <IconSquare size="var(--icon-size-large)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}
