import type { ReactElement } from "react";
import { IconHandStop, IconPointer2, IconSketching } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import {
  DesignPointerFilledIcon,
  PanHandFilledIcon,
  SelectPlayFilledIcon,
  SelectPlayOutlineIcon,
  SketchThickIcon,
} from "./CanvasToolIcons.tsx";
import type { CanvasInteractionTool } from "./keyboardShortcuts.ts";

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

function ToolButton({
  tool,
  activeTool,
  disabled,
  label,
  shortcut,
  icon,
  activeIcon,
  onToolChange,
}: {
  readonly tool: CanvasInteractionTool;
  readonly activeTool: CanvasInteractionTool;
  readonly disabled?: boolean;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: ReactElement;
  readonly activeIcon: ReactElement;
  readonly onToolChange: (tool: CanvasInteractionTool) => void;
}): ReactElement {
  const active = tool === activeTool;
  return (
    <Tooltip content={label} shortcut={shortcut} stableTrigger>
      <IconButton
        variant="quiet"
        size="large"
        className="canvas-toolbar__tool"
        label={label}
        aria-pressed={active}
        data-test={`canvas-tool-${tool}`}
        data-active={active ? "true" : "false"}
        disabled={disabled}
        onClick={() => onToolChange(tool)}
      >
        {active ? activeIcon : icon}
      </IconButton>
    </Tooltip>
  );
}

export function CanvasToolbar({
  tool,
  sketchEnabled,
  onToolChange,
}: CanvasToolbarProps): ReactElement {
  return (
    <div className="canvas-toolbar" data-test="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="canvas-toolbar__tools" role="group" aria-label="Interaction tools">
        <ToolButton
          tool="design"
          activeTool={tool}
          label="Select"
          shortcut="V"
          icon={<IconPointer2 size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<DesignPointerFilledIcon size={ICON_SIZE} aria-hidden="true" />}
          onToolChange={onToolChange}
        />
        <ToolButton
          tool="pan"
          activeTool={tool}
          label="Pan"
          shortcut="H"
          icon={<IconHandStop size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<PanHandFilledIcon size={ICON_SIZE} aria-hidden="true" />}
          onToolChange={onToolChange}
        />
        <ToolButton
          tool="sketch"
          activeTool={tool}
          label="Pencil"
          shortcut="P"
          disabled={!sketchEnabled}
          icon={<IconSketching size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          activeIcon={<SketchThickIcon size={ICON_SIZE} aria-hidden="true" />}
          onToolChange={onToolChange}
        />
      </div>
      <div className="canvas-toolbar__divider" aria-hidden="true" />
      <div className="canvas-toolbar__tools" role="group" aria-label="Preview tools">
        <ToolButton
          tool="select"
          activeTool={tool}
          label="Use app normally"
          shortcut="Hold Shift"
          icon={<SelectPlayOutlineIcon size={ICON_SIZE} aria-hidden="true" />}
          activeIcon={<SelectPlayFilledIcon size={ICON_SIZE} aria-hidden="true" />}
          onToolChange={onToolChange}
        />
      </div>
    </div>
  );
}
