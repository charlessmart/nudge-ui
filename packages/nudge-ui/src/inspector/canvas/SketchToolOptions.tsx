import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip, TooltipGroup } from "../ui/Tooltip.tsx";
import {
  SKETCH_TOOL_SHORTCUTS,
  setSketchDrawingTool,
  setSketchStrokeColor,
  sketchToolForEvent,
  useSketchDrawingTools,
  type SketchDrawingTool,
} from "../sketch/drawingTools.ts";
import { copySketchImageOnRequest } from "../sketch/copySketch.ts";
import { useLiveSketchControls } from "../sketch/liveSketch.ts";
import { SKETCH_PEN_COLORS, SKETCH_RECTANGLE_FILL_OPACITY, type SketchPenColor, type SketchQueueItem } from "../sketch/model.ts";
import { useSketchStore } from "../sketch/store.ts";
import { showToast } from "../ui/Toast.tsx";
import { SketchPreview } from "../sketch/SketchPreview.tsx";
import { SketchThumbnail } from "../sketch/SketchThumbnail.tsx";

/** Closes a popover on an outside press or Escape, without letting that Escape also close the sketch. */
function useDismissablePopover(
  open: boolean,
  rootRef: { readonly current: HTMLElement | null },
  close: () => void,
): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) closeRef.current();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, rootRef]);
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
  children,
}: {
  readonly tool: SketchDrawingTool;
  readonly activeTool: SketchDrawingTool;
  readonly label: string;
  readonly shortcut?: string;
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
        onClick={() => setSketchDrawingTool(tool)}
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

/** Matches the longest swatch collapse in SketchToolOptions.css (duration plus stagger). */
const PALETTE_CLOSE_MS = 180 + (SKETCH_PEN_COLORS.length - 1) * PALETTE_STAGGER_MS;

function ColorPicker({ color, hidden }: { readonly color: SketchPenColor; readonly hidden: boolean }): ReactElement {
  const [phase, setPhase] = useState<PalettePhase>("closed");
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
                setSketchStrokeColor(option);
                closePalette();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** These match `sketch-options-item-in` and the per-item delay in SketchToolOptions.css. The count includes the recent-sketch thumbnails, which are only there once something has been copied. */
const ITEM_COUNT = 6;
const ITEM_BASE_DELAY_MS = 40;
const ITEM_STAGGER_MS = 25;
const ITEM_DURATION_MS = 200;
const INTRO_SETTLE_MS = ITEM_BASE_DELAY_MS + ITEM_DURATION_MS + (ITEM_COUNT - 1) * ITEM_STAGGER_MS;

// The toolbar remounts when sketching moves it into a root-level portal. Remember whether the bar was showing so the
// new copy does not replay the intro.
let barWasOpen = false;

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

const MAX_RECENT_SKETCHES = 3;
/** Matches the slide and fade in SketchToolOptions.css. */
const STACK_MOVE_MS = 200;

interface StackRow {
  readonly item: SketchQueueItem;
  /** How far along the stack the sketch sits: 0 is the newest, in front. */
  readonly slot: number;
  readonly leaving: boolean;
}

/**
 * Lays the recent sketches out by slot. A sketch keeps its element as the stack changes, so a new copy sliding in at
 * the front moves the others along by changing their slot, and CSS animates the difference. A sketch that has left the
 * stack stays one slot further along while it fades, then goes.
 */
function useSketchStack(items: readonly SketchQueueItem[]): readonly StackRow[] {
  const key = items.map((item) => item.document.id).join("|");
  const [previous, setPrevious] = useState<{ readonly key: string; readonly items: readonly SketchQueueItem[]; readonly leaving: readonly StackRow[] }>(
    { key, items, leaving: [] },
  );
  if (previous.key !== key) {
    const present = new Set(items.map((item) => item.document.id));
    const gone = previous.items.flatMap((item, index): StackRow[] => present.has(item.document.id) ? [] : [{ item, slot: index + 1, leaving: true }]);
    setPrevious({ key, items, leaving: [...gone, ...previous.leaving.filter((row) => !present.has(row.item.document.id))] });
  }
  useEffect(() => {
    if (previous.leaving.length === 0) return;
    const timer = window.setTimeout(() => setPrevious((state) => ({ ...state, leaving: [] })), STACK_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [previous.leaving]);
  return [...items.map((item, slot): StackRow => ({ item, slot, leaving: false })), ...previous.leaving];
}

/** A recently copied sketch, kept in case it was never pasted: click to copy it again. */
function RecentSketch({ row, enters }: { readonly row: StackRow; readonly enters: boolean }): ReactElement {
  const { item, slot, leaving } = row;
  // Decided once, on arrival: only a sketch that joins a stack already on show animates in itself.
  const [enter] = useState(enters);

  return (
    <div
      className="sketch-recent"
      data-test={leaving ? "sketch-recent-leaving" : "sketch-recent"}
      data-sketch-id={item.document.id}
      data-leaving={leaving ? "true" : undefined}
      data-enter={enter ? "true" : undefined}
      aria-hidden={leaving ? "true" : undefined}
      // SAFETY: CSSProperties does not list custom properties, but React applies them to inline styles unchanged.
      style={{ "--slot": slot } as CSSProperties}
    >
      <Tooltip
        content={<SketchPreview item={item} />}
        popupClassName="sketch-preview-popup"
        sideOffset={12}
        stableTrigger
      >
        <button
          type="button"
          className="sketch-recent__copy"
          aria-label="Copy recent sketch"
          data-test="sketch-recent-copy"
          onClick={() => void copySketchImageOnRequest(item.document.annotatedImage)}
        >
          <SketchThumbnail item={item} />
          <span className="sketch-recent__copy-icon" aria-hidden="true">
            <IconCopy size="var(--icon-size-small)" />
          </span>
        </button>
      </Tooltip>
    </div>
  );
}

/** The newest few sketches, overlapping like avatars beside the copy button, the newest in front and next to it. */
function RecentSketches({ items, settled }: { readonly items: readonly SketchQueueItem[]; readonly settled: boolean }): ReactElement | null {
  const rows = useSketchStack(items);
  return rows.length > 0 ? <RecentStack rows={rows} count={items.length} settled={settled} /> : null;
}

/** Mounted only while there is something to show, so what it decides on arrival is decided per stack. */
function RecentStack({ rows, count, settled }: { readonly rows: readonly StackRow[]; readonly count: number; readonly settled: boolean }): ReactElement {
  // A stack that appears while the bar is already up (a copy just finished) pops in, while one that is there as the
  // bar opens simply joins the stagger.
  const [pops] = useState(settled);
  // Sketches that join a stack already on show animate in themselves.
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);
  return (
    // SAFETY: CSSProperties does not list custom properties, but React applies them to inline styles unchanged.
    <div className="sketch-recents" data-pop={pops ? "true" : undefined} style={{ "--count": Math.max(count, 1) } as CSSProperties}>
      {/* Moving from one sketch to the next hands the preview straight over instead of closing and reopening it. */}
      <TooltipGroup delay={200} closeDelay={0} timeout={400}>
        {rows.map((row) => <RecentSketch key={row.item.document.id} row={row} enters={shown && settled} />)}
      </TooltipGroup>
    </div>
  );
}

/** Copy is always available, so an empty sketch is answered with a note on what to do rather than a dead button. */
function tellNothingToCopy(): void {
  showToast({ tone: "info", title: "Nothing to copy", description: "Sketch, then click done.", timeout: 3000 });
}

export function SketchToolOptions({ open }: { readonly open: boolean }): ReactElement | null {
  const drawing = useSketchDrawingTools();
  const live = useLiveSketchControls();
  const recents = useSketchStore().items.slice(0, MAX_RECENT_SKETCHES);
  const [skipIntro, setSkipIntro] = useState(() => open && barWasOpen);
  const [settled, setSettled] = useState(() => open && barWasOpen);

  useEffect(() => {
    barWasOpen = open;
    if (!open) {
      // The bar leaves at once; the next time it opens it plays its intro again.
      setSettled(false);
      setSkipIntro(false);
      return;
    }
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), INTRO_SETTLE_MS);
    return () => clearTimeout(timer);
    // `settled` only decides whether the intro timer is needed; it must not restart the effect.
  }, [open]);

  // Only while the sketch tool is open, and never while typing in a text field, so the letters still type.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      const tool = sketchToolForEvent(event);
      if (!tool) return;
      event.preventDefault();
      setSketchDrawingTool(tool);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="sketch-options"
      role="group"
      aria-label="Sketch tools"
      data-intro={skipIntro ? "false" : "true"}
      data-settled={settled ? "true" : "false"}
      data-test="sketch-tool-options"
    >
      <div className="sketch-options__items">
        <BarItem index={0}>
          <IllustratedToolButton tool="pen" activeTool={drawing.tool} label="Pen">
            <PenIllustration color={drawing.color} />
          </IllustratedToolButton>
        </BarItem>
        <BarItem index={1}>
          <IllustratedToolButton tool="eraser" activeTool={drawing.tool} label="Eraser" shortcut={SKETCH_TOOL_SHORTCUTS.eraser}>
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
                onClick={() => setSketchDrawingTool("rectangle")}
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
                onClick={() => setSketchDrawingTool("text")}
            >
              <TextIcon />
            </IconButton>
          </Tooltip>
        </BarItem>
        <BarItem index={4}>
          <ColorPicker color={drawing.color} hidden={!settled} />
        </BarItem>
        <BarItem index={5}>
          {/* The same divider the canvas toolbar uses, setting the copy action apart from the drawing tools. */}
          <div className="canvas-toolbar__divider" aria-hidden="true" data-test="sketch-options-divider" />
          <div className="sketch-options__copy-group" data-test="sketch-copy-group">
            <RecentSketches items={recents} settled={settled} />
            <Tooltip content="Save sketch" stableTrigger>
              <IconButton
                variant="primary"
                label={live.saving ? "Saving…" : "Save sketch"}
                className="sketch-options__copy"
                data-test="sketch-copy"
                aria-busy={live.saving ? "true" : undefined}
                disabled={live.saving}
                onClick={live.hasContent ? live.copy : tellNothingToCopy}
              >
                <IconCheck size={18} aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </div>
        </BarItem>
      </div>
    </div>
  );
}
