import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Slider } from "@base-ui/react/slider";
import { IconBoxModel2, IconClock, IconStack3 } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { DEBUG_TIME_SCALE_MAX } from "./debugView.ts";
import {
  setDebugOutlines,
  setDebugTimeScale,
  setDebugXray,
  useDebugViewState,
} from "./debugViewStore.ts";
import { ToolOptionsDrawer, useDismissablePopover } from "./ToolOptionsDrawer.tsx";

const ICON_SIZE = "var(--icon-size-large)";

function formatScale(scale: number): string {
  return `${Number.isInteger(scale) ? scale : scale.toFixed(1)}×`;
}

function TimingControl({ timeScale, hidden }: { readonly timeScale: number; readonly hidden: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const slowed = timeScale > 1;

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useDismissablePopover(open, rootRef, () => setOpen(false));

  return (
    <div className="debug-options__timing" ref={rootRef}>
      <Tooltip content="Timing" disabled={open} stableTrigger>
        <button
          type="button"
          className="debug-options__timing-trigger canvas-toolbar__tool"
          aria-label={slowed ? `Timing: ${formatScale(timeScale)} slower` : "Timing"}
          aria-expanded={open}
          data-active={slowed ? "true" : "false"}
          data-open={open ? "true" : "false"}
          data-test="debug-tool-timing"
          tabIndex={hidden ? -1 : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <IconClock size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />
          {slowed ? <span className="debug-options__timing-value">{formatScale(timeScale)}</span> : null}
        </button>
      </Tooltip>
      {open ? (
        <div className="tool-options__popover debug-options__timing-popover" data-test="debug-timing-popover">
          <Slider.Root
            className="debug-options__timing-slider"
            min={1}
            max={DEBUG_TIME_SCALE_MAX}
            step={0.5}
            value={timeScale}
            data-test="debug-timing-slider"
            onValueChange={(value) => setDebugTimeScale(value)}
          >
            <div className="debug-options__timing-label">
              <Slider.Label>Slow animations</Slider.Label>
              <span className="debug-options__timing-readout">{formatScale(timeScale)}</span>
            </div>
            <Slider.Control className="debug-options__timing-control">
              <Slider.Track className="debug-options__timing-track">
                <Slider.Indicator className="debug-options__timing-indicator" />
                <Slider.Thumb className="debug-options__timing-thumb" data-test="debug-timing-thumb" />
              </Slider.Track>
            </Slider.Control>
            <div className="debug-options__timing-scale" aria-hidden="true">
              <span>1×</span>
              <span>{DEBUG_TIME_SCALE_MAX}×</span>
            </div>
          </Slider.Root>
        </div>
      ) : null}
    </div>
  );
}

function ToggleTool({
  label,
  active,
  hidden,
  dataTest,
  icon,
  onToggle,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly hidden: boolean;
  readonly dataTest: string;
  readonly icon: ReactElement;
  readonly onToggle: (active: boolean) => void;
}): ReactElement {
  return (
    <Tooltip content={label} stableTrigger>
      <IconButton
        variant="quiet"
        size="large"
        className="canvas-toolbar__tool"
        label={label}
        aria-pressed={active}
        data-active={active ? "true" : "false"}
        data-test={dataTest}
        tabIndex={hidden ? -1 : undefined}
        onClick={() => onToggle(!active)}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
}

/** Timing, Outlines and X-ray views that slide out beside the Debug tool. */
export function DebugToolOptions({ open }: { readonly open: boolean }): ReactElement {
  const debug = useDebugViewState();
  return (
    <ToolOptionsDrawer name="debug" open={open} label="Debug tools">
      {({ hidden, settled }) => (
        <>
          <TimingControl timeScale={debug.timeScale} hidden={hidden || !settled} />
          <ToggleTool
            label="Outlines"
            active={debug.outlines}
            hidden={hidden}
            dataTest="debug-tool-outlines"
            icon={<IconBoxModel2 size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
            onToggle={setDebugOutlines}
          />
          <ToggleTool
            label="X-ray"
            active={debug.xray}
            hidden={hidden}
            dataTest="debug-tool-xray"
            icon={<IconStack3 size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
            onToggle={setDebugXray}
          />
        </>
      )}
    </ToolOptionsDrawer>
  );
}
