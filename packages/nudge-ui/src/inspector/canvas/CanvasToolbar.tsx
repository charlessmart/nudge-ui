import type { ReactElement } from "react";
import {
  IconHandStop,
  IconPointer2,
  IconSketching,
} from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";

export type CanvasInteractionTool = "move" | "pan" | "sketch";

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

function ToolButton({
  active,
  disabled,
  label,
  icon,
  onClick,
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly icon: ReactElement;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <IconButton
      variant="quiet"
      size="large"
      className="canvas-toolbar__tool"
      label={label}
      title={label}
      aria-pressed={active}
      data-test={`canvas-tool-${label.toLowerCase()}`}
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </IconButton>
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
          active={tool === "move"}
          label="Move"
          icon={<IconPointer2 size="var(--icon-size-large)" stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          onClick={() => onToolChange("move")}
        />
        <ToolButton
          active={tool === "pan"}
          label="Pan"
          icon={<IconHandStop size="var(--icon-size-large)" stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          onClick={() => onToolChange("pan")}
        />
        <ToolButton
          active={tool === "sketch"}
          label="Sketch"
          disabled={!sketchEnabled}
          icon={<IconSketching size="var(--icon-size-large)" stroke="var(--icon-stroke-width)" aria-hidden="true" />}
          onClick={() => onToolChange("sketch")}
        />
      </div>
    </div>
  );
}
