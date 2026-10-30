import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactElement } from "react";
import {
  IconAdjustmentsHorizontal,
  IconAdjustmentsHorizontalFilled,
  IconMessageCircle,
  IconMessageCircleFilled,
  IconPointer2,
  IconSketching,
} from "@tabler/icons-react";
import { AddPageMenu } from "./AddPageMenu.tsx";
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

export const CANVAS_ZOOM_LEVELS = [0.25, 0.5, 0.9, 1] as const;

export function closestCanvasZoomLevel(zoom: number): number {
  let closest: number = CANVAS_ZOOM_LEVELS[0];
  for (const candidate of CANVAS_ZOOM_LEVELS) {
    if (Math.abs(candidate - zoom) < Math.abs(closest - zoom)) closest = candidate;
  }
  return closest;
}

export function adjacentCanvasZoomLevel(zoom: number, direction: -1 | 1): number | null {
  const current = closestCanvasZoomLevel(zoom);
  const index = CANVAS_ZOOM_LEVELS.findIndex((candidate) => candidate === current);
  const next = CANVAS_ZOOM_LEVELS[index + direction];
  return next === undefined ? null : next;
}

export interface CanvasToolbarProps {
  readonly tool: CanvasInteractionTool;
  readonly sketchEnabled: boolean;
  /** The Add page button slides in beside Inspection while the Canvas is showing, and out again in Focus view. */
  readonly addPageVisible: boolean;
  readonly onPageAdded: (cardId: string) => void;
  readonly onToolChange: (tool: CanvasInteractionTool) => void;
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
  addPageVisible,
  onPageAdded,
  onToolChange,
}: CanvasToolbarProps): ReactElement {
  const { ref, onPointerDown, onPointerMove, onPointerEnd, onDoubleClick } = useDraggableToolbar();
  const [addPageOpen, setAddPageOpen] = useState(false);

  // The Inspection panel and the Add page menu float over the same spot, so only one is open at a time.
  useEffect(() => {
    if (tool === "debug") setAddPageOpen(false);
  }, [tool]);

  function changeAddPageOpen(open: boolean): void {
    setAddPageOpen(open);
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
      </div>
      <div className="canvas-toolbar__divider" aria-hidden="true" />
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
          icon={<IconAdjustmentsHorizontal size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<IconAdjustmentsHorizontalFilled size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-debug"
          onClick={() => onToolChange("debug")}
        />
        <div className="canvas-toolbar__add" data-visible={addPageVisible ? "true" : "false"} data-test="canvas-toolbar-add-page">
          <div className="canvas-toolbar__add-inner">
            <div className="canvas-toolbar__divider" aria-hidden="true" />
            <AddPageMenu onAdded={onPageAdded} open={addPageOpen} onOpenChange={changeAddPageOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}
