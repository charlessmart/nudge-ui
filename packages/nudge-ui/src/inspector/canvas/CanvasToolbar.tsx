import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactElement } from "react";
import {
  IconMessageCircle,
  IconMessageCircleFilled,
  IconPointer2,
  IconScanEye,
  IconSketching,
} from "@tabler/icons-react";
import { CanvasZoomMenu, type CanvasZoomMenuProps } from "./CanvasZoomMenu.tsx";
import { ToolbarButton } from "./ToolbarButton.tsx";
import {
  DesignPointerFilledIcon,
  SelectPlayFilledIcon,
  SelectPlayOutlineIcon,
  SketchThickIcon,
} from "./CanvasToolIcons.tsx";
import {
  DEFAULT_TOOLBAR_OFFSET,
  applyToolbarOffset,
  clampToolbarOffset,
  rememberToolbarOffset,
  rememberedToolbarOffset,
  type ToolbarOffset,
} from "./toolbarPosition.ts";
import { INSPECTION_SHORTCUTS, type CanvasInteractionTool } from "./keyboardShortcuts.ts";

export type { CanvasInteractionTool } from "./keyboardShortcuts.ts";

export const CANVAS_ZOOM_LEVELS = [0.25, 0.5, 0.9, 1, 1.5, 2, 3] as const;

export function closestCanvasZoomLevel(zoom: number): number {
  let closest: number = CANVAS_ZOOM_LEVELS[0];
  for (const candidate of CANVAS_ZOOM_LEVELS) {
    if (Math.abs(candidate - zoom) < Math.abs(closest - zoom)) closest = candidate;
  }
  return closest;
}

/** The next preset past the current zoom, so a zoom between presets steps to the nearer one in that direction. */
export function adjacentCanvasZoomLevel(zoom: number, direction: -1 | 1): number | null {
  const epsilon = 0.001;
  const next = direction > 0
    ? CANVAS_ZOOM_LEVELS.find((candidate) => candidate > zoom + epsilon)
    : [...CANVAS_ZOOM_LEVELS].reverse().find((candidate) => candidate < zoom - epsilon);
  return next ?? null;
}

export interface CanvasToolbarProps {
  readonly tool: CanvasInteractionTool;
  readonly sketchEnabled: boolean;
  readonly onToolChange: (tool: CanvasInteractionTool) => void;
  /** The zoom control at the toolbar's end; left out where the page has no Canvas to zoom. */
  readonly zoom?: CanvasZoomMenuProps;
}

const ICON_SIZE = "var(--icon-size-large)";
/** Movement below this stays a click. */
const DRAG_THRESHOLD_PX = 4;
const GRIP_SELECTOR = ".canvas-toolbar__grip";

/** The handle reaches 12px below the toolbar; past the clamp's own 8px margin, a dragged toolbar leaves this much room for it at the window's bottom edge. */
const GRIP_REACH_PX = 4;

function withGrip(rect: DOMRect): Pick<DOMRect, "left" | "right" | "top" | "bottom"> {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom + GRIP_REACH_PX };
}

function onGrip(event: { readonly target: EventTarget }): boolean {
  return event.target instanceof Element && event.target.closest(GRIP_SELECTOR) !== null;
}

/**
 * Lets the toolbar be dragged by its handle, remembering where it was left for this page load.
 * The position is an offset from the default spot, set on the inspector host so the bars floating above it follow, and is not saved across page loads.
 */
function useDraggableToolbar() {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef<ToolbarOffset>(DEFAULT_TOOLBAR_OFFSET);
  const drag = useRef<{ pointerId: number; x: number; y: number; from: ToolbarOffset; rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">; moved: boolean } | null>(null);

  function place(toolbar: HTMLElement, next: ToolbarOffset): void {
    offset.current = next;
    rememberToolbarOffset(next);
    applyToolbarOffset(toolbar, next);
  }

  function keepInWindow(toolbar: HTMLElement): void {
    const view = toolbar.ownerDocument.defaultView;
    if (!view) return;
    const next = clampToolbarOffset(offset.current, offset.current, withGrip(toolbar.getBoundingClientRect()), { width: view.innerWidth, height: view.innerHeight });
    if (next.x !== offset.current.x || next.y !== offset.current.y) place(toolbar, next);
  }

  useEffect(() => {
    const toolbar = ref.current;
    const view = toolbar?.ownerDocument.defaultView;
    if (!toolbar || !view) return;
    place(toolbar, rememberedToolbarOffset());
    keepInWindow(toolbar);
    const onResize = (): void => keepInWindow(toolbar);
    view.addEventListener("resize", onResize);
    return () => view.removeEventListener("resize", onResize);
  }, []);

  return {
    ref,
    onPointerDown(event: PointerEvent<HTMLDivElement>): void {
      const toolbar = ref.current;
      if (!toolbar || event.button !== 0 || !event.isPrimary) return;
      if (!onGrip(event)) return;
      toolbar.setPointerCapture(event.pointerId);
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        from: offset.current,
        rect: withGrip(toolbar.getBoundingClientRect()),
        moved: false,
      };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>): void {
      const toolbar = ref.current;
      const start = drag.current;
      const view = toolbar?.ownerDocument.defaultView;
      if (!toolbar || !start || !view || event.pointerId !== start.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        start.moved = true;
        toolbar.setAttribute("data-dragging", "true");
      }
      place(toolbar, clampToolbarOffset(
        { x: start.from.x + dx, y: start.from.y + dy },
        start.from,
        start.rect,
        { width: view.innerWidth, height: view.innerHeight },
      ));
    },
    onPointerEnd(event: PointerEvent<HTMLDivElement>): void {
      const start = drag.current;
      if (!start || event.pointerId !== start.pointerId) return;
      drag.current = null;
      ref.current?.removeAttribute("data-dragging");
    },
    onDoubleClick(event: MouseEvent<HTMLDivElement>): void {
      const toolbar = ref.current;
      if (!toolbar || !onGrip(event)) return;
      place(toolbar, DEFAULT_TOOLBAR_OFFSET);
    },
  };
}

export function CanvasToolbar({
  tool,
  sketchEnabled,
  onToolChange,
  zoom,
}: CanvasToolbarProps): ReactElement {
  const { ref, onPointerDown, onPointerMove, onPointerEnd, onDoubleClick } = useDraggableToolbar();
  const [zoomOpen, setZoomOpen] = useState(false);

  // The Inspection panel and the zoom menu float over the same spot, so only one is open at a time.
  useEffect(() => {
    if (tool === "debug") setZoomOpen(false);
  }, [tool]);

  function changeZoomOpen(open: boolean): void {
    setZoomOpen(open);
    // Selecting the active Inspection tool again puts it away.
    if (open && tool === "debug") onToolChange("debug");
  }

  return (
    <div
      className="canvas-toolbar canvas-toolbar--movable"
      data-test="canvas-toolbar"
      role="toolbar"
      aria-label="Canvas tools"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={onDoubleClick}
    >
      <div className="canvas-toolbar__grip" aria-hidden="true" />
      <div className="canvas-toolbar__tools" role="group" aria-label="Interaction tools">
        <ToolbarButton
          active={tool === "design"}
          label="Select"
          shortcut="V"
          icon={<IconPointer2 size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<DesignPointerFilledIcon size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-design"
          onClick={() => onToolChange("design")}
        />
        <ToolbarButton
          active={tool === "comment"}
          label="Comment"
          shortcut="C"
          icon={<IconMessageCircle size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<IconMessageCircleFilled size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-comment"
          onClick={() => onToolChange("comment")}
        />
        <ToolbarButton
          active={tool === "sketch"}
          label="Pencil"
          shortcut="P"
          disabled={!sketchEnabled}
          icon={<IconSketching size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<SketchThickIcon size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-sketch"
          onClick={() => onToolChange("sketch")}
        />
        <ToolbarButton
          active={tool === "debug"}
          label="Inspection"
          shortcut={INSPECTION_SHORTCUTS.tool.label}
          icon={<IconScanEye size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<IconScanEye size={ICON_SIZE} stroke={2.4} aria-hidden="true" />}
          dataTest="canvas-tool-debug"
          onClick={() => onToolChange("debug")}
        />
      </div>
      <div className="canvas-toolbar__divider" aria-hidden="true" />
      {/* Previewing the app and zooming change how the page is viewed, not the page itself. */}
      <div className="canvas-toolbar__tools" role="group" aria-label="Preview tools">
        <ToolbarButton
          active={tool === "select"}
          label="Use app normally"
          shortcut="Hold A"
          icon={<SelectPlayOutlineIcon size={ICON_SIZE} aria-hidden="true" />}
          activeIcon={<SelectPlayFilledIcon size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-select"
          onClick={() => onToolChange("select")}
        />
        {zoom ? <CanvasZoomMenu {...zoom} open={zoomOpen} onOpenChange={changeZoomOpen} /> : null}
      </div>
    </div>
  );
}
