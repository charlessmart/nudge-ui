import type { ReactElement } from "react";
import {
  IconHandMove,
  IconMessageCirclePlus,
  IconMinus,
  IconPencil,
  IconPlus,
  IconPointer,
} from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Select, type SelectOption } from "../ui/Select.tsx";

export type CanvasInteractionTool = "move" | "pan" | "sketch" | "annotate";

export const CANVAS_ZOOM_LEVELS = [0.25, 0.5, 0.9, 1] as const;

export const CANVAS_ZOOM_OPTIONS: SelectOption[] = CANVAS_ZOOM_LEVELS.map((zoom) => ({
  value: String(zoom),
  label: `${Math.round(zoom * 100)}%`,
}));

export const CANVAS_PRESENTATION_ZOOM_OPTION: SelectOption = {
  value: "focus",
  label: "Focus",
};

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
  readonly presentation: "focus" | "canvas";
  readonly zoom: number;
  readonly sketchEnabled: boolean;
  readonly onToolChange: (tool: CanvasInteractionTool) => void;
  readonly onZoomChange: (value: string) => void;
  readonly onZoomStep: (direction: -1 | 1) => void;
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
      size="default"
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
  presentation,
  zoom,
  sketchEnabled,
  onToolChange,
  onZoomChange,
  onZoomStep,
}: CanvasToolbarProps): ReactElement {
  const zoomValue = presentation === "focus" ? "focus" : String(closestCanvasZoomLevel(zoom));
  const zoomOptions = [...CANVAS_ZOOM_OPTIONS, CANVAS_PRESENTATION_ZOOM_OPTION];
  const zoomOutDisabled = presentation === "canvas"
    ? adjacentCanvasZoomLevel(zoom, -1) === null
    : false;
  const zoomInDisabled = presentation === "focus" || adjacentCanvasZoomLevel(zoom, 1) === null;

  return (
    <div className="canvas-toolbar" data-test="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="canvas-toolbar__tools" role="group" aria-label="Interaction tools">
        <ToolButton
          active={tool === "move"}
          label="Move"
          icon={<IconPointer size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />}
          onClick={() => onToolChange("move")}
        />
        <ToolButton
          active={tool === "pan"}
          label="Pan"
          icon={<IconHandMove size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />}
          onClick={() => onToolChange("pan")}
        />
        <ToolButton
          active={tool === "sketch"}
          label="Sketch"
          disabled={!sketchEnabled}
          icon={<IconPencil size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />}
          onClick={() => onToolChange("sketch")}
        />
        <ToolButton
          active={tool === "annotate"}
          label="Annotate"
          disabled={!sketchEnabled}
          icon={<IconMessageCirclePlus size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />}
          onClick={() => onToolChange("annotate")}
        />
      </div>
      <span className="canvas-toolbar__separator" role="separator" aria-orientation="vertical" />
      <div className="canvas-toolbar__zoom" role="group" aria-label="Zoom controls">
        <IconButton
          variant="quiet"
          size="default"
          label="Zoom out"
          title="Zoom out"
          data-test="canvas-zoom-out"
          disabled={zoomOutDisabled}
          onClick={() => onZoomStep(-1)}
        >
          <IconMinus size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />
        </IconButton>
        <Select
          value={zoomValue}
          options={zoomOptions}
          aria-label="Canvas zoom"
          data-test="canvas-zoom-select"
          className="canvas-toolbar__zoom-select"
          onValueChange={onZoomChange}
        />
        <IconButton
          variant="quiet"
          size="default"
          label="Zoom in"
          title="Zoom in"
          data-test="canvas-zoom-in"
          disabled={zoomInDisabled}
          onClick={() => onZoomStep(1)}
        >
          <IconPlus size="var(--icon-size-large)" stroke={1.8} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
