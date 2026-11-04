import type { ReactElement } from "react";
import { Menu } from "@base-ui/react/menu";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Tooltip } from "../ui/Tooltip.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { getPlatformModifierKey } from "../shell/shortcuts.ts";
import type { CanvasPresentation } from "./viewStore.ts";

export interface CanvasZoomMenuProps {
  readonly presentation: CanvasPresentation;
  readonly zoom: number;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly disabled: boolean;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomToActualSize: () => void;
  readonly onFocus: () => void;
  readonly onCanvas: () => void;
}

interface CanvasZoomMenuState {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Focus shows the frame at its own size, so it reads as 100%. */
export function canvasZoomLabel(presentation: CanvasPresentation, zoom: number): string {
  return `${Math.round((presentation === "focus" ? 1 : zoom) * 100)}%`;
}

export function CanvasZoomMenu({
  presentation,
  zoom,
  canZoomIn,
  canZoomOut,
  disabled,
  onZoomIn,
  onZoomOut,
  onZoomToActualSize,
  onFocus,
  onCanvas,
  open,
  onOpenChange,
}: CanvasZoomMenuProps & CanvasZoomMenuState): ReactElement {
  const modifier = getPlatformModifierKey();
  const chord = (key: string): string => (modifier === "⌘" ? `⌘${key}` : `Ctrl ${key}`);
  const inFocus = presentation === "focus";
  return (
    <Menu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Tooltip content="Zoom" stableTrigger>
        <Menu.Trigger className="canvas-zoom-menu__trigger" disabled={disabled} data-test="canvas-zoom-menu">
          <span className="canvas-zoom-menu__value" data-test="canvas-zoom-value">{canvasZoomLabel(presentation, zoom)}</span>
          <IconChevronDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal container={portalContainer()}>
        <Menu.Positioner className="inspector-popover__positioner" side="top" align="end" sideOffset={12}>
          <Menu.Popup className="inspector-popover__popup canvas-zoom-menu__popup" data-test="canvas-zoom-menu-popup">
            <Menu.Item className="canvas-zoom-menu__item" disabled={!canZoomIn} onClick={onZoomIn} data-test="canvas-zoom-in">
              <span>Zoom in</span>
              <kbd className="canvas-zoom-menu__shortcut">{chord("+")}</kbd>
            </Menu.Item>
            <Menu.Item
              className="canvas-zoom-menu__item"
              disabled={inFocus || Math.abs(zoom - 1) < 0.001}
              onClick={onZoomToActualSize}
              data-test="canvas-zoom-actual-size"
            >
              Zoom to 100%
            </Menu.Item>
            <Menu.Item className="canvas-zoom-menu__item" disabled={!canZoomOut} onClick={onZoomOut} data-test="canvas-zoom-out">
              <span>Zoom out</span>
              <kbd className="canvas-zoom-menu__shortcut">{chord("−")}</kbd>
            </Menu.Item>
            <Menu.Separator className="canvas-zoom-menu__separator" />
            <Menu.CheckboxItem
              className="canvas-zoom-menu__item"
              checked={inFocus}
              closeOnClick
              onCheckedChange={(checked) => (checked ? onFocus() : onCanvas())}
              data-test="canvas-zoom-focus"
            >
              <span>View in focus</span>
              <Menu.CheckboxItemIndicator className="canvas-zoom-menu__indicator">
                <IconCheck size={15} stroke={2.4} aria-hidden="true" />
              </Menu.CheckboxItemIndicator>
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
