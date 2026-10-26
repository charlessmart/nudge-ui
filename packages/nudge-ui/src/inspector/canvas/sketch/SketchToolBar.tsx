import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { Button } from "../../ui/Button.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Tooltip } from "../../ui/Tooltip.tsx";
import { SKETCH_TOOL_SHORTCUTS, sketchToolForEvent } from "./sketchShortcuts.ts";
import type { SketchDrawingTool } from "../../sketch/drawingTools.ts";
import { copySketchImageOnRequest } from "./copySketch.ts";
import { SKETCH_LIMITS, SKETCH_PEN_COLORS, SKETCH_RECTANGLE_FILL_OPACITY, type SketchDocument, type SketchPenColor } from "../../sketch/model.ts";
import { removeSketch } from "./store.ts";
import { showToast } from "../../ui/Toast.tsx";
import { sketchThumbnailCrop } from "../../sketch/ink.ts";
import { BlobImage } from "./BlobImage.tsx";
import { SketchThumbnail } from "./SketchThumbnail.tsx";

/**
 * Closes a popover on an outside press or Escape, without letting that Escape also close the sketch. Pressing inside a
 * frame of the canvas never reaches this window, but it takes focus away from it, so that closes the popover too.
 */
function useDismissablePopover(
  open: boolean,
  rootRef: { readonly current: HTMLElement | null },
  close: () => void,
  /** A part of the popover that lives elsewhere in the page, where a press is also inside it. */
  extraRef?: { readonly current: HTMLElement | null },
): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      const path = event.composedPath();
      if (rootRef.current && !path.includes(rootRef.current) && !(extraRef?.current && path.includes(extraRef.current))) closeRef.current();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    }
    function onBlur(): void {
      closeRef.current();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, rootRef, extraRef]);
}

function PenIllustration({ color }: { readonly color: SketchPenColor }): ReactElement {
  const id = useId();
  return (
    <svg className="sketch-options__illustration sketch-options__illustration--pen" viewBox="0 0 20 47" width={20} height={47} fill="none" aria-hidden="true">
      <path
        d="M1.84492 27.3255C2.22193 26.8144 2.81931 26.5127 3.45445 26.5127H16.1011C16.7362 26.5127 17.3336 26.8144 17.7106 27.3255L19.1651 29.2974C19.4187 29.6413 19.5556 30.0573 19.5556 30.4846V44.9998C19.5556 46.1044 18.6601 46.9998 17.5556 46.9998H2C0.895432 46.9998 0 46.1044 0 44.9998V30.4846C0 30.0573 0.136838 29.6413 0.390464 29.2974L1.84492 27.3255Z"
        fill={`url(#${id}-barrel)`}
      />
      <path
        d="M3.4541 26.7627H16.1016C16.6571 26.7628 17.18 27.0265 17.5098 27.4736L18.9639 29.4463C19.1856 29.747 19.3056 30.1107 19.3057 30.4844V45C19.3056 45.9664 18.522 46.7499 17.5557 46.75H2C1.03357 46.75 0.250102 45.9664 0.25 45V30.4844C0.250045 30.1107 0.370031 29.7471 0.591797 29.4463L2.0459 27.4736C2.37572 27.0265 2.89852 26.7628 3.4541 26.7627Z"
        stroke="black"
        strokeOpacity={0.3}
        strokeWidth={0.5}
      />
      <path
        opacity={0.2}
        d="M0.5 29.827L2.09916 27.8035C2.66811 27.0835 3.53527 26.6636 4.45289 26.6636H15.5314C16.1432 26.6636 16.7213 26.9435 17.1006 27.4235L19 29.827C19 29.827 18.3604 30.6988 10 30.7309C2.7733 30.9407 0.5 29.827 0.5 29.827Z"
        fill="white"
      />
      <rect x={9} width={2} height={4.51922} rx={1} fill={color.value} />
      <path
        d="M8.46794 3.90451L6.3377 11.8468C6.16733 12.482 6.64593 13.1059 7.30356 13.1059H12.6964C13.3541 13.1059 13.8327 12.482 13.6623 11.8468L11.5321 3.90452C11.4148 3.46745 11.0187 3.16357 10.5662 3.16357H9.4338C8.98128 3.16357 8.58516 3.46745 8.46794 3.90451Z"
        fill="#DFDBD8"
      />
      <path
        d="M9.43359 3.41357H10.5664C10.9057 3.41367 11.2031 3.6415 11.291 3.96924L13.4209 11.9116C13.5486 12.388 13.1895 12.856 12.6963 12.856H7.30371C6.81051 12.856 6.45139 12.388 6.5791 11.9116L8.70898 3.96924C8.79689 3.6415 9.09429 3.41367 9.43359 3.41357Z"
        stroke="black"
        strokeOpacity={0.2}
        strokeWidth={0.5}
      />
      <path
        d="M4.21018 13.6159L2.91363 25.8034C2.81727 26.7092 3.34313 27.5769 4.22007 27.8232C8.64659 29.0666 13.0414 28.5136 15.6629 27.8088C16.5323 27.5751 17.0451 26.7212 16.9499 25.826L15.6642 13.7403C15.6121 13.251 15.3815 12.7981 15.0165 12.4681L14.6267 12.1159C14.2591 11.7836 13.7812 11.5996 13.2856 11.5996H6.40068C5.82792 11.5996 5.28266 11.8452 4.90305 12.274L4.70133 12.502C4.42582 12.8132 4.25415 13.2026 4.21018 13.6159Z"
        fill={`url(#${id}-barrel-upper)`}
      />
      <path
        d="M6.40039 11.8496H13.2861C13.7196 11.8497 14.1374 12.0111 14.459 12.3018L14.8486 12.6533C15.168 12.942 15.3705 13.3385 15.416 13.7666L16.7012 25.8525C16.785 26.6413 16.3334 27.3696 15.5977 27.5674C13.0048 28.2644 8.6582 28.8104 4.28809 27.583C3.54101 27.3732 3.07734 26.6278 3.16211 25.8301L4.45898 13.6426C4.49746 13.2809 4.64766 12.9403 4.88867 12.668L5.08984 12.4395C5.42194 12.0643 5.89934 11.8497 6.40039 11.8496Z"
        stroke="black"
        strokeOpacity={0.3}
        strokeWidth={0.5}
      />
      <path
        d="M0.5 29.8266C0.5 29.8266 0.611036 29.4017 0.812755 29.4479C2.04229 29.73 6.64097 30.7305 10 30.7305C13.3766 30.7305 17.633 29.7195 18.7316 29.4436C18.9052 29.4 19 29.8266 19 29.8266V32.0863C19 32.0863 14.5 33.442 10 33.442C5.5 33.442 0.5 32.0863 0.5 32.0863V29.8266Z"
        fill={color.value}
      />
      <defs>
        <linearGradient id={`${id}-barrel`} x1="1.24823" y1="37.8542" x2="16.9974" y2="38.058" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2E2E2E" />
          <stop offset="0.248334" stopColor="#575757" />
          <stop offset="0.660438" stopColor="#242424" />
          <stop offset="1" stopColor="#2E2E2E" />
        </linearGradient>
        <linearGradient id={`${id}-barrel-upper`} x1="3.66667" y1="20.9895" x2="16.1878" y2="21.6653" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2E2E2E" />
          <stop offset="0.248334" stopColor="#575757" />
          <stop offset="0.660438" stopColor="#242424" />
          <stop offset="1" stopColor="#2E2E2E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function EraserIllustration(): ReactElement {
  const id = useId();
  return (
    <svg className="sketch-options__illustration sketch-options__illustration--eraser" viewBox="0 0 22 47" width={22} height={47} fill="none" aria-hidden="true">
      <path
        d="M0.302734 4.7855V32.0302C0.302734 33.7251 1.40783 35.2219 3.0276 35.721L16.5844 39.898C19.0565 40.6597 21.5639 38.8232 21.5836 36.2366L21.8269 4.22443C21.8393 2.59599 20.8289 1.13477 19.3009 0.571436L19.1428 0.513114C18.2253 0.174845 17.2467 0.0339522 16.271 0.0996387L3.90538 0.932154C1.8777 1.06867 0.302734 2.75323 0.302734 4.7855Z"
        fill="#DFDBD8"
      />
      <mask id={`${id}-shade-mask`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x={0} y={0} width={22} height={27}>
        <path
          d="M0.302734 4.7855V18.1255C0.302734 19.8204 1.40783 21.3173 3.0276 21.8164L16.6054 25.9999C19.0712 26.7596 21.5743 24.9341 21.6044 22.3541L21.8158 4.23606C21.8348 2.60193 20.8233 1.1327 19.2899 0.567375L19.1428 0.513114C18.2253 0.174845 17.2467 0.0339521 16.271 0.0996387L3.90538 0.932154C1.8777 1.06867 0.302734 2.75323 0.302734 4.7855Z"
          fill="#131211"
        />
      </mask>
      <g mask={`url(#${id}-shade-mask)`}>
        <g opacity={0.7} filter={`url(#${id}-blur)`}>
          <path
            d="M4.40022 2.17282C2.33677 1.90432 3.237 0.727298 3.94504 0.335731L14.1105 -2.01367C14.6668 -2.01367 16.4471 -1.71161 19.1174 -0.503342C21.7878 0.704922 22.253 1.11886 22.1519 1.1748L16.6898 1.51043C13.4531 1.73418 6.46367 2.44133 4.40022 2.17282Z"
            fill="white"
          />
          <path
            d="M5.5 10.4287V21.2917C9.01287 22.5379 17.0143 25.0204 20.8216 22.1607C22.8245 20.6563 21.6392 14.6978 21.8484 12.754C22.4553 7.11543 21.6967 2.68513 18.2071 2.68513C17.4484 2.74107 15 3.04186 10.5 3.47638C6.03379 3.90764 5.39885 7.96741 5.5 10.4287Z"
            fill="white"
          />
          <path
            d="M4.40022 5.87361V21.7262C3.42918 23.6057 1.51777 20.7842 0.759154 19.5536C0.809729 17.4839 0.758789 6.10855 0.758789 5.03454C0.758789 3.69202 1.51741 1.84606 2.88293 2.3495C3.97534 2.75226 4.34963 4.86672 4.40022 5.87361Z"
            fill="white"
          />
        </g>
        <path
          d="M16.2881 0.348633C17.2286 0.285354 18.1722 0.421976 19.0566 0.748047L19.2148 0.805664C20.6438 1.33259 21.5887 2.69971 21.5771 4.22266L21.334 36.2344C21.3156 38.6536 18.9702 40.3714 16.6582 39.6592L3.10156 35.4824C1.58668 35.0157 0.552786 33.6154 0.552734 32.0303V4.78516L0.556641 4.6084C0.644771 2.78788 2.08482 1.30547 3.92188 1.18164L16.2881 0.348633Z"
          stroke="black"
          strokeOpacity={0.1}
          strokeWidth={0.5}
        />
      </g>
      <path d="M4.55172 21.3245L0.303448 18.9751H0V44.6507L4.09655 47.0001L22 44.1473V19.3107L4.55172 21.3245Z" fill={`url(#${id}-sleeve)`} />
      <path
        d="M0.253906 19.1685L4.45801 21.4937L4.5127 21.5229L4.57422 21.5161L21.8066 19.5269V43.9819L4.13281 46.7983L0.193359 44.5386V19.1685H0.253906Z"
        stroke="black"
        strokeOpacity={0.3}
        strokeWidth={0.386207}
      />
      <defs>
        <filter id={`${id}-blur`} x={-0.786039} y={-3.5585} width={24.4949} height={28.5867} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation={0.772414} result="effect1_foregroundBlur" />
        </filter>
        <linearGradient id={`${id}-sleeve`} x1="1.01446e-07" y1="26.0713" x2="8.5" y2="26.0713" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5D5D5D" />
          <stop offset="0.48629" stopColor="#5D5D5D" />
          <stop offset="0.568482" stopColor="#2B2B2B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RectangleIcon({ color }: { readonly color: SketchPenColor }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden="true">
      <rect x={1} y={1} width={22} height={22} rx={4} fill={color.value} fillOpacity={SKETCH_RECTANGLE_FILL_OPACITY} stroke={color.value} strokeWidth={2} />
    </svg>
  );
}

/** A serif "T": bar, short serifs at its ends, stem, and a foot. */
function TextIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 7V5.5h12V7M12 5.5v13M9.5 18.5h5" />
    </svg>
  );
}

function IllustratedToolButton({
  tool,
  activeTool,
  label,
  shortcut,
  onSelect,
  children,
}: {
  readonly tool: SketchDrawingTool;
  readonly activeTool: SketchDrawingTool;
  readonly label: string;
  readonly shortcut?: string;
  readonly onSelect: (tool: SketchDrawingTool) => void;
  readonly children: ReactElement;
}): ReactElement {
  const active = tool === activeTool;
  return (
    <Tooltip content={label} shortcut={shortcut} stableTrigger>
      <button
        type="button"
        className="sketch-options__illustrated"
        aria-label={label}
        aria-pressed={active}
        data-active={active ? "true" : "false"}
        data-test={`sketch-tool-${tool}`}
        onClick={() => onSelect(tool)}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const PALETTE_RADIUS = 26;
const PALETTE_SWATCH_SIZE = 32;
const PALETTE_STAGGER_MS = 18;
const PALETTE_STACK_ORDER: readonly string[] = ["yellow", "orange", "red", "black", "green", "blue"];

function paletteSwatchOffset(index: number, count: number): CSSProperties {
  const radians = ((-90 + (index + 0.5) * (360 / count)) * Math.PI) / 180;
  return {
    "--swatch-x": `${(PALETTE_RADIUS * Math.cos(radians)).toFixed(2)}px`,
    "--swatch-y": `${(PALETTE_RADIUS * Math.sin(radians)).toFixed(2)}px`,
  } as CSSProperties;
}

type PalettePhase = "closed" | "open" | "closing";

/** Matches the longest swatch collapse in SketchToolBar.css (duration plus stagger). */
const PALETTE_CLOSE_MS = 180 + (SKETCH_PEN_COLORS.length - 1) * PALETTE_STAGGER_MS;

function ColorPicker({ color, hidden, initiallyOpen, onColorChange }: {
  readonly color: SketchPenColor;
  readonly hidden: boolean;
  readonly initiallyOpen: boolean;
  readonly onColorChange: (color: SketchPenColor) => void;
}): ReactElement {
  const [phase, setPhase] = useState<PalettePhase>(initiallyOpen && !hidden ? "open" : "closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const open = phase === "open";

  // Collapse the swatches back into the trigger before unmounting them.
  function closePalette(): void {
    clearTimeout(closeTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("closed");
      return;
    }
    setPhase("closing");
    closeTimer.current = setTimeout(() => setPhase("closed"), PALETTE_CLOSE_MS);
  }

  useEffect(() => {
    if (!hidden) return;
    clearTimeout(closeTimer.current);
    setPhase("closed");
  }, [hidden]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useDismissablePopover(open, rootRef, closePalette);

  return (
    <div className="sketch-options__color" ref={rootRef}>
      <Tooltip content="Color" disabled={phase !== "closed"} stableTrigger>
        <button
          type="button"
          className="sketch-options__color-trigger"
          aria-label={`Color: ${color.name}`}
          aria-expanded={open}
          data-open={open ? "true" : "false"}
          data-test="sketch-tool-color"
          tabIndex={hidden ? -1 : undefined}
          onClick={() => {
            if (open) {
              closePalette();
              return;
            }
            clearTimeout(closeTimer.current);
            setPhase("open");
          }}
        >
          <span className="sketch-options__swatch" style={{ background: color.value }} />
        </button>
      </Tooltip>
      {phase !== "closed" ? (
        <div
          className="sketch-options__palette"
          role="group"
          aria-label="Pen color"
          data-state={phase}
          data-test="sketch-color-palette"
          style={{ "--swatch-size": `${PALETTE_SWATCH_SIZE}px` } as CSSProperties}
        >
          {SKETCH_PEN_COLORS.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className="sketch-options__palette-option"
              aria-label={option.name}
              aria-pressed={option === color}
              data-active={option === color ? "true" : "false"}
              data-test={`sketch-color-${option.id}`}
              style={{
                ...paletteSwatchOffset(index, SKETCH_PEN_COLORS.length),
                "--swatch-delay": `${index * PALETTE_STAGGER_MS}ms`,
                "--swatch-delay-out": `${(SKETCH_PEN_COLORS.length - 1 - index) * PALETTE_STAGGER_MS}ms`,
                background: option.value,
                zIndex: option === color ? SKETCH_PEN_COLORS.length : Math.max(PALETTE_STACK_ORDER.indexOf(option.id), 0),
              } as CSSProperties}
              onClick={() => {
                onColorChange(option);
                closePalette();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** These match `sketch-options-item-in` and the per-item delay in SketchToolBar.css. The count includes the recent-sketch thumbnails, which are only there once something has been copied. */
const ITEM_COUNT = 6;
const ITEM_BASE_DELAY_MS = 40;
const ITEM_STAGGER_MS = 25;
const ITEM_DURATION_MS = 200;
const INTRO_SETTLE_MS = ITEM_BASE_DELAY_MS + ITEM_DURATION_MS + (ITEM_COUNT - 1) * ITEM_STAGGER_MS;

function BarItem({ index, children }: {
  readonly index: number;
  readonly children: ReactNode;
}): ReactElement {
  // SAFETY: CSSProperties does not list custom properties, but React applies them to inline styles unchanged.
  return (
    <div className="sketch-options__item" style={{ "--item-index": index } as CSSProperties}>
      {children}
    </div>
  );
}

/** Matches the slide and fade in SketchToolBar.css. */
const STACK_MOVE_MS = 200;

/** How long a card takes to travel between its thumbnail and its place in the grid, and the delay between cards. */
const CARD_MOVE_MS = 260;
const CARD_STAGGER_MS = 30;
/** How far past the card its clip reaches when it is full size, so the shadow is not cut off. */
const CARD_SHADOW_ROOM = 48;

/** The turn of an element's computed transform, in degrees. The tiles lean, so a card has to land at the same angle. */
function turnDegrees(transform: string): number {
  const match = /matrix\(([^)]+)\)/.exec(transform)?.[1];
  if (!match) return 0;
  const values = match.split(",").map(Number);
  if (values.length < 2) return 0;
  return (Math.atan2(values[1]!, values[0]!) * 180) / Math.PI;
}

interface StackRow {
  readonly item: SketchDocument;
  /** How far along the stack the sketch sits: 0 is the newest, in front. */
  readonly slot: number;
  readonly leaving: boolean;
}

/**
 * Lays the recent sketches out by slot. A sketch keeps its element as the stack changes, so a new copy sliding in at
 * the front moves the others along by changing their slot, and CSS animates the difference. A sketch that has left the
 * stack stays one slot further along while it fades, then goes.
 */
function useSketchStack(items: readonly SketchDocument[]): readonly StackRow[] {
  const key = items.map((item) => item.id).join("|");
  const [previous, setPrevious] = useState<{ readonly key: string; readonly items: readonly SketchDocument[]; readonly leaving: readonly StackRow[] }>(
    { key, items, leaving: [] },
  );
  if (previous.key !== key) {
    const present = new Set(items.map((item) => item.id));
    const gone = previous.items.flatMap((item, index): StackRow[] => present.has(item.id) ? [] : [{ item, slot: index + 1, leaving: true }]);
    setPrevious({ key, items, leaving: [...gone, ...previous.leaving.filter((row) => !present.has(row.item.id))] });
  }
  useEffect(() => {
    if (previous.leaving.length === 0) return;
    const timer = window.setTimeout(() => setPrevious((state) => ({ ...state, leaving: [] })), STACK_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [previous.leaving]);
  return [...items.map((item, slot): StackRow => ({ item, slot, leaving: false })), ...previous.leaving];
}


/** How far one of the sketches behind the front one sits from it, and how far it leans. */
interface StackPose {
  readonly x: number;
  readonly y: number;
  readonly tilt: number;
}

/**
 * The front sketch sits upright. The two behind it lean out either side of it, one to the right and one to the left,
 * and anything further back sits straight behind the front one, so it never shows.
 */
function stackPose(slot: number): StackPose {
  if (slot === 1) return { x: 8, y: 5, tilt: 8 };
  if (slot === 2) return { x: -8, y: 5, tilt: -8 };
  return { x: 0, y: 0, tilt: 0 };
}

/** One of the stacked thumbnails beside the save button. Clicking the stack opens or closes the grid of larger sketches. */
function RecentSketch({ row, enters, open, onToggle }: {
  readonly row: StackRow;
  readonly enters: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactElement {
  const { item, slot, leaving } = row;
  // Decided once, on arrival: only a sketch that is saved while the bar is already up animates in.
  const [enter] = useState(enters);
  const pose = stackPose(slot);

  return (
    <div
      className="sketch-recent"
      data-test={leaving ? "sketch-recent-leaving" : "sketch-recent"}
      data-sketch-id={item.id}
      data-leaving={leaving ? "true" : undefined}
      data-enter={enter ? "true" : undefined}
      aria-hidden={leaving ? "true" : undefined}
      // SAFETY: CSSProperties does not list custom properties, but React applies them to inline styles unchanged.
      style={{
        "--slot": slot,
        "--stack-x": `${pose.x}px`,
        "--stack-y": `${pose.y}px`,
        "--tilt": `${pose.tilt}deg`,
      } as CSSProperties}
    >
      <button
        type="button"
        className="sketch-recent__toggle"
        aria-label={open ? "Hide saved sketches" : "Show saved sketches"}
        aria-expanded={open}
        tabIndex={leaving ? -1 : undefined}
        data-test="sketch-recent-copy"
        onClick={onToggle}
      >
        <SketchThumbnail item={item} />
      </button>
    </div>
  );
}

/** A saved sketch at a size worth looking at: click to copy it again, or remove it. */
function RecentSketchCard({ item, onCopy, onRemove }: {
  readonly item: SketchDocument;
  readonly onCopy: (item: SketchDocument) => void;
  readonly onRemove: (item: SketchDocument) => void;
}): ReactElement {
  return (
    <div className="sketch-grid__card" data-test="sketch-recent-card" data-sketch-id={item.id}>
      <button
        type="button"
        className="sketch-grid__copy"
        aria-label="Copy recent sketch"
        data-test="sketch-recent-card-copy"
        onClick={() => onCopy(item)}
      >
        <BlobImage className="sketch-grid__image" blob={item.image} width={item.imageWidth} height={item.imageHeight} />
        <span className="sketch-grid__copy-action button button--primary button--default" aria-hidden="true">
          <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" />
          Copy sketch
        </span>
      </button>
      <button
        type="button"
        className="sketch-grid__remove"
        aria-label="Remove recent sketch"
        data-test="sketch-recent-remove"
        onClick={() => onRemove(item)}
      >
        <IconX size={10} stroke={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The newest few sketches, stacked small beside the save button. Clicking the stack grows them into a wrapping grid of
 * large cards above the bar, where each can be previewed in place, clicked to copy again, or removed; the stack always
 * takes one tile of room, so the bar does not shift. An outside press, Escape or a copy closes the grid.
 */
function RecentSketches({ items, settled, expanded, onCopy, onRemove }: {
  readonly items: readonly SketchDocument[];
  readonly settled: boolean;
  readonly expanded: boolean;
  readonly onCopy: (item: SketchDocument) => void;
  readonly onRemove: (item: SketchDocument) => void;
}): ReactElement | null {
  const rows = useSketchStack(items);
  const [open, setOpen] = useState(expanded);
  // After a close the cards are still on their way back into the stack, so the grid stays up until they arrive.
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The grid is centered on the screen, not on the bar, which on a narrow screen is wider than it and off to one side.
  // So it is drawn in the sketch layer when there is one, and beside the stack otherwise.
  const [layer, setLayer] = useState<Element | null>(null);
  const hasSketches = items.length > 0;
  useLayoutEffect(() => {
    setLayer(rootRef.current?.closest(".sketch-bar-layer") ?? null);
  }, [hasSketches]);
  const close = (): void => {
    if (!open) return;
    setOpen(false);
    setClosing(true);
  };
  useDismissablePopover(open, rootRef, close, gridRef);
  // Removing the last sketch leaves nothing to show, and the grid should not come back open for the next one. An empty
  // list at first is the sketches still loading, so a bar that starts expanded keeps its grid.
  const hadSketches = useRef(items.length > 0);
  useEffect(() => {
    if (items.length > 0) {
      hadSketches.current = true;
      return;
    }
    if (!hadSketches.current) return;
    setOpen(false);
    setClosing(false);
  }, [items.length]);
  // The cards grow out of their thumbnails when the grid opens and settle back into them when it closes.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const cards = grid ? [...grid.querySelectorAll<HTMLElement>(".sketch-grid__card")] : [];
    if (!open && !closing) return;
    const tiles = rootRef.current ? [...rootRef.current.querySelectorAll<HTMLElement>(".sketch-recent:not([data-leaving])")] : [];
    // The stack is cut off by the bar's bottom edge. Clipping the grid to the same line keeps the cut straight for the
    // cards that land leaning, so they arrive exactly as the stack shows them. Read first, write once the cards are set.
    const stackEdge = rootRef.current?.querySelector<HTMLElement>(".sketch-recents")?.getBoundingClientRect().bottom ?? 0;
    const cutBelow = grid && stackEdge && !open ? grid.getBoundingClientRect().bottom - stackEdge : null;
    const animations = cards.flatMap((card, index) => {
      const tile = tiles.find((candidate) => candidate.getAttribute("data-sketch-id") === card.getAttribute("data-sketch-id"));
      if (!tile || typeof card.animate !== "function") return [];
      const from = card.getBoundingClientRect();
      const to = tile.getBoundingClientRect();
      // The thumbnail is a square and the card is not. The card is scaled so its shorter side fills the thumbnail, and
      // clipped on its longer side to a square, so it changes shape smoothly on the way rather than snapping at the end.
      // The tile leans with the stack, so the card lands at the tile's own size and angle; `to` is the larger box that
      // rotation paints into, which would leave the card a little too big and upright.
      const turn = turnDegrees(getComputedStyle(tile).transform);
      const radians = (turn * Math.PI) / 180;
      const tileSide = to.width / (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
      const side = Math.min(from.width, from.height);
      const scale = tileSide / side;
      const trimX = Math.max(from.width - side, 0) / 2;
      const trimY = Math.max(from.height - side, 0) / 2;
      const thumbnail = tile.querySelector<HTMLElement>(".sketch-thumbnail");
      const tileRadius = thumbnail ? parseFloat(getComputedStyle(thumbnail).borderTopLeftRadius) / scale : 0;
      const cardRadius = parseFloat(getComputedStyle(card.querySelector<HTMLElement>(".sketch-grid__image") ?? card).borderTopLeftRadius);
      // Wide enough to leave the card's shadow alone once it is full size.
      const small: Keyframe = {
        transform: `translate(${to.x + to.width / 2 - (from.x + from.width / 2)}px, ${to.y + to.height / 2 - (from.y + from.height / 2)}px) rotate(${turn}deg) scale(${scale})`,
        clipPath: `inset(${trimY}px ${trimX}px round ${tileRadius}px)`,
      };
      // Fully opaque throughout: the thumbnail is swapped for its card at the same instant, so nothing dips in between.
      const large: Keyframe = { transform: "none", clipPath: `inset(${-CARD_SHADOW_ROOM}px round ${cardRadius}px)` };
      const timing: KeyframeAnimationOptions = {
        duration: CARD_MOVE_MS,
        // The newest card (last in the grid) leaves the stack first and is the last to settle back into it.
        delay: (open ? cards.length - 1 - index : index) * CARD_STAGGER_MS,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        // Opening ends where the card naturally sits; closing stays small until the grid goes.
        fill: open ? "backwards" : "forwards",
      };
      const moves = [card.animate(open ? [small, large] : [large, small], timing)];
      // The thumbnail shows only the part of the picture around the ink, and the card all of it. So inside the card the
      // picture is zoomed onto that part while it is small, and eases out to the whole picture as the card grows.
      const image = card.querySelector<HTMLElement>(".sketch-grid__image");
      const item = items.find((candidate) => candidate.id === card.getAttribute("data-sketch-id"));
      if (image && item && item.imageWidth > 0 && item.imageHeight > 0) {
        const crop = item.ink ? sketchThumbnailCrop(item.ink, item.imageWidth, item.imageHeight) : { x: 0, y: 0, width: item.imageWidth, height: item.imageHeight };
        // The picture fills the card the way `object-fit: cover` does, and the thumbnail's square is the middle of the crop.
        const fit = Math.max(from.width / item.imageWidth, from.height / item.imageHeight);
        const offsetX = (from.width - item.imageWidth * fit) / 2;
        const offsetY = (from.height - item.imageHeight * fit) / 2;
        const zoom = side / (Math.min(crop.width, crop.height) * fit);
        const centerX = offsetX + (crop.x + crop.width / 2) * fit;
        const centerY = offsetY + (crop.y + crop.height / 2) * fit;
        const zoomed: Keyframe = {
          transformOrigin: "0 0",
          transform: `translate(${from.width / 2 - zoom * centerX}px, ${from.height / 2 - zoom * centerY}px) scale(${zoom})`,
        };
        const whole: Keyframe = { transformOrigin: "0 0", transform: "none" };
        moves.push(image.animate(open ? [zoomed, whole] : [whole, zoomed], timing));
      }
      return moves;
    });
    if (grid) grid.style.clipPath = cutBelow === null ? "" : `inset(-1000px -1000px ${cutBelow}px -1000px)`;
    if (open) return () => animations.forEach((animation) => animation.cancel());
    if (animations.length === 0) {
      setClosing(false);
      return;
    }
    let current = true;
    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => current && setClosing(false),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [open, closing]);
  if (rows.length === 0) return null;
  const showGrid = (open || closing) && items.length > 0;
  const grid = (
    <div
      ref={gridRef}
      className="sketch-grid"
      role="group"
      aria-label="Saved sketches"
      data-test="sketch-grid"
      // SAFETY: CSSProperties does not list custom properties, but React applies them to inline styles unchanged.
      style={{ "--count": items.length, "--rows": Math.ceil(items.length / 3) } as CSSProperties}
    >
      {/* Oldest first, so the newest comes last and paints over the rest, as it does on top of the stack. */}
      {[...items].reverse().map((item) => (
        <RecentSketchCard
          key={item.id}
          item={item}
          onCopy={(chosen) => {
            close();
            onCopy(chosen);
          }}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
  return (
    <div ref={rootRef} className="sketch-recents-root">
      <div className="sketch-recents" data-test="sketch-recents" data-open={showGrid ? "true" : "false"}>
        {rows.map((row) => (
          <RecentSketch
            key={row.item.id}
            row={row}
            enters={settled}
            open={open}
            onToggle={() => {
              if (open) close();
              else {
                setClosing(false);
                setOpen(true);
              }
            }}
          />
        ))}
      </div>
      {showGrid ? (layer ? createPortal(grid, layer) : grid) : null}
    </div>
  );
}

/** Copy is always available, so an empty sketch is answered with a note on what to do rather than a dead button. */
function tellNothingToSave(): void {
  showToast({ tone: "info", title: "Draw a sketch, then save", timeout: 3000 });
}

export interface SketchToolBarProps {
  readonly open: boolean;
  readonly tool: SketchDrawingTool;
  readonly color: SketchPenColor;
  /** The saved sketches, newest first. */
  readonly recents: readonly SketchDocument[];
  /** True while a save is in flight. */
  readonly saving: boolean;
  /** Whether there is anything drawn to save. */
  readonly hasContent: boolean;
  readonly onToolChange: (tool: SketchDrawingTool) => void;
  readonly onColorChange: (color: SketchPenColor) => void;
  readonly onSave: () => void;
  /** Clicking a saved sketch; by default it copies that sketch's image again. */
  readonly onCopyRecent?: (item: SketchDocument) => void;
  /** Clicking a saved sketch's remove button. */
  readonly onRemoveRecent?: (item: SketchDocument) => void;
  /** Starts with the saved sketches opened into their arc above the bar, for fixtures that show that state. */
  readonly expanded?: boolean;
  /** Shows the bar in its settled state at once, with no intro and no keyboard shortcuts, for fixtures that hold one state. */
  readonly still?: boolean;
  /** Starts with the colour palette fanned out. */
  readonly paletteOpen?: boolean;
}

function copyRecentSketch(item: SketchDocument): void {
  void copySketchImageOnRequest(item.image);
}

async function removeRecentSketch(item: SketchDocument): Promise<void> {
  try {
    if (!await removeSketch(item.id)) throw new Error("The sketch could not be removed.");
  } catch (error) {
    showToast({
      tone: "error",
      title: "Sketch not removed",
      description: error instanceof Error ? error.message : "The sketch could not be removed.",
    });
  }
}

/** The sketch bar with its state passed in, so a page can show it in any state. The canvas wiring lives in `SketchWorkspace`. */
export function SketchToolBar({
  open,
  tool,
  color,
  recents: allRecents,
  saving,
  hasContent,
  onToolChange,
  onColorChange,
  onSave,
  onCopyRecent = copyRecentSketch,
  onRemoveRecent = removeRecentSketch,
  expanded = false,
  still = false,
  paletteOpen = false,
}: SketchToolBarProps): ReactElement | null {
  const recents = allRecents.slice(0, SKETCH_LIMITS.keptSketches);
  const [settled, setSettled] = useState(still);

  useEffect(() => {
    if (still) return;
    if (!open) {
      // The bar leaves at once; the next time it opens it plays its intro again.
      setSettled(false);
      return;
    }
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), INTRO_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [open, settled, still]);

  // Only while the sketch is open, and never while typing in a text field, so the letters still type.
  useEffect(() => {
    if (!open || still) return;
    function onKeyDown(event: KeyboardEvent): void {
      const nextTool = sketchToolForEvent(event);
      if (!nextTool) return;
      event.preventDefault();
      onToolChange(nextTool);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onToolChange, open, still]);

  if (!open) return null;
  const drawing = { tool, color };

  return (
    <div
      className="sketch-options"
      role="group"
      aria-label="Sketch tools"
      data-intro={still ? "false" : "true"}
      data-settled={settled ? "true" : "false"}
      data-test="sketch-tool-options"
    >
      <div className="sketch-options__items">
        <BarItem index={0}>
          <IllustratedToolButton tool="pen" activeTool={drawing.tool} label="Pen" shortcut={SKETCH_TOOL_SHORTCUTS.pen} onSelect={onToolChange}>
            <PenIllustration color={drawing.color} />
          </IllustratedToolButton>
        </BarItem>
        <BarItem index={1}>
          <IllustratedToolButton tool="eraser" activeTool={drawing.tool} label="Eraser" shortcut={SKETCH_TOOL_SHORTCUTS.eraser} onSelect={onToolChange}>
            <EraserIllustration />
          </IllustratedToolButton>
        </BarItem>
        <BarItem index={2}>
          <Tooltip content="Rectangle" shortcut={SKETCH_TOOL_SHORTCUTS.rectangle} stableTrigger>
            <IconButton
              variant="quiet"
              size="large"
              className="canvas-toolbar__tool sketch-options__plain-tool"
              label="Rectangle"
              aria-pressed={drawing.tool === "rectangle"}
              data-active={drawing.tool === "rectangle" ? "true" : "false"}
              data-test="sketch-tool-rectangle"
                onClick={() => onToolChange("rectangle")}
            >
              <RectangleIcon color={drawing.color} />
            </IconButton>
          </Tooltip>
        </BarItem>
        <BarItem index={3}>
          <Tooltip content="Text" shortcut={SKETCH_TOOL_SHORTCUTS.text} stableTrigger>
            <IconButton
              variant="quiet"
              size="large"
              className="canvas-toolbar__tool sketch-options__plain-tool"
              label="Text"
              aria-pressed={drawing.tool === "text"}
              data-active={drawing.tool === "text" ? "true" : "false"}
              data-test="sketch-tool-text"
                onClick={() => onToolChange("text")}
            >
              <TextIcon />
            </IconButton>
          </Tooltip>
        </BarItem>
        <BarItem index={4}>
          <ColorPicker color={drawing.color} hidden={!settled} initiallyOpen={paletteOpen} onColorChange={onColorChange} />
        </BarItem>
        <BarItem index={5}>
          {/* The same divider the canvas toolbar uses, setting the save action apart from the drawing tools. */}
          <div className="canvas-toolbar__divider" aria-hidden="true" data-test="sketch-options-divider" />
          <div className="sketch-options__copy-group" data-test="sketch-copy-group">
            <RecentSketches items={recents} settled={settled} expanded={expanded} onCopy={onCopyRecent} onRemove={onRemoveRecent} />
            <Button
              variant="primary"
              size="default"
              className="sketch-options__copy"
              data-test="sketch-copy"
              aria-busy={saving ? "true" : undefined}
              disabled={saving}
              onClick={hasContent ? onSave : tellNothingToSave}
            >
              <IconCheck size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
              Save
            </Button>
          </div>
        </BarItem>
      </div>
    </div>
  );
}
