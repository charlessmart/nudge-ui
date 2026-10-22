import type { ReactElement } from "react";
import {
  IconMessageCircle,
  IconMessageCircleFilled,
  IconKeyframes,
  IconKeyframesFilled,
  IconPointer2,
  IconSketching,
} from "@tabler/icons-react";
import { ToolbarButton } from "./ToolbarButton.tsx";
import {
  DesignPointerFilledIcon,
  SelectPlayFilledIcon,
  SelectPlayOutlineIcon,
  SketchThickIcon,
} from "./CanvasToolIcons.tsx";
import type { CanvasInteractionTool } from "./keyboardShortcuts.ts";
import { SketchToolOptions } from "./SketchToolOptions.tsx";
import { ViewToolButton } from "./ViewToolButton.tsx";

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
  readonly onToolChange: (tool: CanvasInteractionTool) => void;
}

const ICON_SIZE = "var(--icon-size-large)";

export function CanvasToolbar({
  tool,
  sketchEnabled,
  onToolChange,
}: CanvasToolbarProps): ReactElement {
  return (
    <div className="canvas-toolbar" data-test="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
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
        <SketchToolOptions open={tool === "sketch" && sketchEnabled} />
        <ToolbarButton
          active={tool === "animation"}
          label="Animation"
          icon={<IconKeyframes size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<IconKeyframesFilled size={ICON_SIZE} aria-hidden="true" />}
          dataTest="canvas-tool-animation"
          onClick={() => onToolChange("animation")}
        />
        <ViewToolButton
          active={tool === "debug"}
          onActivate={() => onToolChange("debug")}
          onToggle={() => onToolChange("debug")}
        />
      </div>
      <div className="canvas-toolbar__divider" aria-hidden="true" />
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
    </div>
  );
}
