import { useLayoutEffect, useRef } from "react";
import type { ReactElement } from "react";
import { IconPlayerPauseFilled, IconReload } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { RollingText } from "../ui/RollingText.tsx";
import { Slider } from "../ui/Slider.tsx";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import {
  ANIMATION_SPEED_STEP,
  animationSpeedAtPosition,
  animationSpeedToPosition,
  formatAnimationSpeed,
  MAX_ANIMATION_SPEED,
  MIN_ANIMATION_SPEED,
  snapAnimationSpeed,
} from "./animationSpeed.ts";
import {
  setAnimationSpeed,
  setAnimationsPaused,
  setExplodeView,
  setInspectionBarHeight,
  setOutlinesView,
  setSpacingView,
  useAnimationSpeed,
  useAnimationsPaused,
  useExplodeView,
  useOutlinesView,
  useSpacingView,
} from "./debugViewStore.ts";
import { sendAnimationReplayToAll } from "./rendererState.ts";

const ICON_SIZE = "var(--icon-size-small)";
/** Shift with an arrow key moves the speed by this many tenths. */
const LARGE_STEP_TENTHS = 3;

interface SwitchRowProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly dataTest: string;
  onPressedChange(pressed: boolean): void;
}

/** A labelled switch that takes the whole row as its target, so the label is part of the control. */
function SwitchRow({ label, pressed, dataTest, onPressedChange }: SwitchRowProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      className="inspection-bar__switch"
      data-test={dataTest}
      data-on={pressed ? "" : undefined}
      onClick={() => onPressedChange(!pressed)}
    >
      {label}
      <span className="inspection-bar__track" aria-hidden="true" />
    </button>
  );
}

/**
 * The Inspection tool's panel, floating above the canvas toolbar while the tool is active: every animation on the page
 * runs at the speed set here, and the switches draw the page's spacing and outlines or pull a clicked subtree apart.
 */
export function InspectionBar(): ReactElement {
  const speed = useAnimationSpeed();
  const paused = useAnimationsPaused();
  const explode = useExplodeView();
  const outlines = useOutlinesView();
  const spacing = useSpacingView();

  // Toasts read the bar's height to stay clear of it.
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = (): void => setInspectionBarHeight(Math.round(bar.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      setInspectionBarHeight(0);
    };
  }, []);

  return (
    <div ref={barRef} className="inspection-bar" data-test="inspection-bar" role="region" aria-label="Inspection">
      <div className="inspection-bar__title">Inspection tools</div>
      <section className="inspection-bar__speed" aria-labelledby="inspection-speed-label">
        <div className="inspection-bar__speed-head">
          <span id="inspection-speed-label">Animation speed</span>
          <span className="inspection-bar__speed-value" aria-hidden="true"><RollingText value={formatAnimationSpeed(speed)} /></span>
        </div>
        <div className="inspection-bar__speed-row">
          <Tooltip content="Pause animations" stableTrigger>
            <ToggleButton
              label="Pause animations"
              size="compact"
              pressed={paused}
              onPressedChange={setAnimationsPaused}
              data-test="animation-pause"
            >
              <IconPlayerPauseFilled size={ICON_SIZE} aria-hidden="true" />
            </ToggleButton>
          </Tooltip>
          <Tooltip content="Replay animations" stableTrigger>
            <IconButton
              label="Replay animations"
              size="compact"
              onClick={sendAnimationReplayToAll}
              data-test="animation-replay"
            >
              <IconReload size={ICON_SIZE} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Slider
            label="Animation speed"
            dataTest="animation-speed"
            className="inspection-bar__slider"
            filled
            position={animationSpeedToPosition(speed)}
            valueMin={MIN_ANIMATION_SPEED}
            valueMax={MAX_ANIMATION_SPEED}
            valueNow={speed}
            valueText={formatAnimationSpeed(speed)}
            onChange={(position) => setAnimationSpeed(animationSpeedAtPosition(position))}
            onStep={(direction, large) => setAnimationSpeed(snapAnimationSpeed(speed + direction * (large ? LARGE_STEP_TENTHS : 1) * ANIMATION_SPEED_STEP))}
          />
        </div>
      </section>
      <section className="inspection-bar__section" aria-label="Overlays">
        <SwitchRow label="Spacing" pressed={spacing} dataTest="inspection-spacing" onPressedChange={setSpacingView} />
        <SwitchRow label="Outlines" pressed={outlines} dataTest="inspection-outlines" onPressedChange={setOutlinesView} />
        <SwitchRow label="Explode on click" pressed={explode} dataTest="inspection-explode" onPressedChange={setExplodeView} />
      </section>
    </div>
  );
}
