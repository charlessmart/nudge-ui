import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { Slider } from "@base-ui/react/slider";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconRefresh,
} from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Select } from "../ui/Select.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useSelectedElement } from "../selection/selectionStore.ts";
import { AnimationScope } from "./AnimationScope.tsx";
import { ANIMATION_SPEEDS, AnimationSession, IDLE_ANIMATION_SNAPSHOT } from "./animationSession.ts";
import { setAnimationDebug, useAnimationDebug } from "./debugViewStore.ts";

const SPEED_OPTIONS = ANIMATION_SPEEDS.map((speed) => ({
  value: String(speed),
  label: `${speed}×`,
  testId: `animation-speed-${speed}`,
}));

const STATUS_LABEL = {
  idle: "",
  waiting: "Move pointer away",
  capturing: "Listening…",
  none: "Didn't animate anything",
  ready: "",
} as const;

const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const getIdleSnapshot = (): typeof IDLE_ANIMATION_SNAPSHOT => IDLE_ANIMATION_SNAPSHOT;

/** Floats above the canvas toolbar while the Animation tool has an element to inspect. */
export function AnimationBar(): ReactElement | null {
  const prefs = useAnimationDebug();
  const selected = useSelectedElement();
  const element = selected?.domElement ?? null;
  const session = useMemo(() => (element ? new AnimationSession(element) : null), [element]);

  useEffect(() => {
    if (!session) return;
    session.setSpeed(prefs.speed);
    // A click runs the app's own handlers, so only a described animation starts by itself.
    const first = session.entries[0];
    if (first && first.kind !== "click") session.run(first);
    return () => session.dispose();
    // The speed is applied by its own control below; a new element restarts from the stored value.
  }, [session]);

  const snapshot = useSyncExternalStore(
    session?.subscribe ?? NO_SUBSCRIBE,
    session?.getSnapshot ?? getIdleSnapshot,
    session?.getSnapshot ?? getIdleSnapshot,
  );

  if (!prefs.enabled) return null;
  if (!session) {
    return (
      <div className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
        <span className="animation-bar__name">Select an element to inspect its animations</span>
      </div>
    );
  }

  if (session.entries.length === 0) {
    return (
      <div className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
        <span className="animation-bar__name" data-test="animation-empty">No animations on this element</span>
      </div>
    );
  }

  const ready = snapshot.status === "ready";
  const current = session.entries.find((entry) => entry.id === snapshot.entryId);
  const status = STATUS_LABEL[snapshot.status];

  return (
    <div className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
      <AnimationScope selected={session.element} entry={current} />
      <Select
        compact
        className="animation-bar__select"
        aria-label="Animation"
        data-test="animation-select"
        placeholder="Choose animation"
        value={snapshot.entryId ?? undefined}
        options={session.entries.map((entry) => ({ value: entry.id, label: entry.label }))}
        onValueChange={(id) => {
          const entry = session.entries.find((candidate) => candidate.id === id);
          if (entry) session.run(entry);
        }}
      />
      {status ? <span className="animation-bar__status" data-test="animation-status">{status}</span> : null}
      <Tooltip content={snapshot.playing ? "Pause" : "Play"} stableTrigger>
        <IconButton
          variant="quiet"
          size="compact"
          label={snapshot.playing ? "Pause" : "Play"}
          disabled={!ready}
          data-test="animation-play"
          onClick={() => (snapshot.playing ? session.pause() : session.play())}
        >
          {snapshot.playing ? <IconPlayerPauseFilled aria-hidden="true" /> : <IconPlayerPlayFilled aria-hidden="true" />}
        </IconButton>
      </Tooltip>
      <Tooltip content="Back 16ms" stableTrigger>
        <IconButton variant="quiet" size="compact" label="Back 16ms" disabled={!ready} data-test="animation-back" onClick={() => session.step(-1)}>
          <IconPlayerTrackPrev aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <Slider.Root
        className="animation-bar__scrubber"
        min={0}
        max={1}
        step={0.001}
        value={snapshot.progress}
        disabled={!ready}
        aria-label="Animation progress"
        data-test="animation-scrubber"
        onValueChange={(value) => session.seek(Array.isArray(value) ? value[0]! : value)}
      >
        <Slider.Control className="animation-bar__scrubber-control">
          <Slider.Track className="animation-bar__scrubber-track">
            <Slider.Indicator className="animation-bar__scrubber-indicator" />
            <Slider.Thumb className="animation-bar__scrubber-thumb" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <Tooltip content="Forward 16ms" stableTrigger>
        <IconButton variant="quiet" size="compact" label="Forward 16ms" disabled={!ready} data-test="animation-forward" onClick={() => session.step(1)}>
          <IconPlayerTrackNext aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <Tooltip content="Replay" stableTrigger>
        <IconButton
          variant="quiet"
          size="compact"
          label="Replay"
          disabled={!current}
          data-test="animation-replay"
          onClick={() => current && session.run(current)}
        >
          <IconRefresh aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <SegmentedControl
        aria-label="Playback speed"
        data-test="animation-speed"
        className="animation-bar__speed"
        value={String(prefs.speed)}
        options={SPEED_OPTIONS}
        disabled={!ready}
        onChange={(value) => {
          setAnimationDebug({ speed: Number(value) });
          session.setSpeed(Number(value));
        }}
      />
    </div>
  );
}
