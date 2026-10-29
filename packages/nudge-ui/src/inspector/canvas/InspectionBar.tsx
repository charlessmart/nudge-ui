import { useLayoutEffect, useRef } from "react";
import type { ReactElement } from "react";
import { IconCube3dSphere, IconMinus, IconPlus } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
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
import { INSPECTION_SHORTCUTS } from "./keyboardShortcuts.ts";
import {
  setAnimationSpeed,
  setExplodeView,
  setInspectionBarHeight,
  setOutlinesView,
  setSpacingView,
  useAnimationSpeed,
  useExplodeView,
  useOutlinesView,
  useSpacingView,
} from "./debugViewStore.ts";

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
 * runs at the speed set here, the switches draw the page's spacing and outlines, and
 * Explode sits at the foot.
 */
export function InspectionBar(): ReactElement {
  const speed = useAnimationSpeed();
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
          <span className="inspection-bar__value" data-test="animation-speed-readout">{formatAnimationSpeed(speed)}</span>
        </div>
        <div className="inspection-bar__speed-row">
          <IconButton
            label="Slow down"
            data-test="animation-speed-slower"
            disabled={speed <= MIN_ANIMATION_SPEED}
            onClick={() => setAnimationSpeed(snapAnimationSpeed(speed - ANIMATION_SPEED_STEP))}
          >
            <IconMinus size={ICON_SIZE} aria-hidden="true" />
          </IconButton>
          <div className="inspection-bar__slider-well">
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
          <IconButton
            label="Speed up"
            data-test="animation-speed-faster"
            disabled={speed >= MAX_ANIMATION_SPEED}
            onClick={() => setAnimationSpeed(snapAnimationSpeed(speed + ANIMATION_SPEED_STEP))}
          >
            <IconPlus size={ICON_SIZE} aria-hidden="true" />
          </IconButton>
        </div>
      </section>
      <section className="inspection-bar__section" aria-label="Overlays">
        <SwitchRow label="Spacing" pressed={spacing} dataTest="inspection-spacing" onPressedChange={setSpacingView} />
        <SwitchRow label="Outlines" pressed={outlines} dataTest="inspection-outlines" onPressedChange={setOutlinesView} />
      </section>
      <div className="inspection-bar__section">
        <Tooltip content="Pull the page's layers apart" shortcut={INSPECTION_SHORTCUTS.explode.label} stableTrigger>
          <ToggleButton
            className="inspection-bar__explode"
            label="Explode tool"
            pressed={explode}
            onPressedChange={setExplodeView}
            data-test="inspection-explode"
          >
            <IconCube3dSphere size={ICON_SIZE} aria-hidden="true" />
            <span>Explode tool</span>
          </ToggleButton>
        </Tooltip>
      </div>
    </div>
  );
}
