import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconMinus,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
} from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Select } from "../ui/Select.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useSelectedElement } from "../selection/selectionStore.ts";
import { ANIMATION_SPEEDS, AnimationSession, IDLE_ANIMATION_SNAPSHOT } from "./animationSession.ts";
import { AnimationTimeline } from "./AnimationTimeline.tsx";
import { setAnimationBusy, setAnimationSpeed, useAnimationSpeed } from "./debugViewStore.ts";

const STATUS_LABEL = {
  idle: "",
  waiting: "Move pointer away",
  capturing: "Listening…",
  none: "Didn't animate anything",
  ready: "",
} as const;

const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const getIdleSnapshot = (): typeof IDLE_ANIMATION_SNAPSHOT => IDLE_ANIMATION_SNAPSHOT;

/** Floats above the canvas toolbar while the Animation tool is active. */
export function AnimationBar(): ReactElement | null {
  const speed = useAnimationSpeed();
  const selected = useSelectedElement();
  const element = selected?.domElement ?? null;
  const session = useMemo(() => (element ? new AnimationSession(element) : null), [element]);

  useEffect(() => {
    if (!session) return;
    session.setSpeed(speed);
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

  // While the animation moves under the pointer, the page's markers and element label would only be in the way.
  const [scrubbing, setScrubbing] = useState(false);
  const busy = snapshot.playing || scrubbing;
  useEffect(() => setAnimationBusy(busy), [busy]);
  useEffect(() => () => setAnimationBusy(false), []);

  // With nothing selected, or nothing to play on the selection, the full toolbar stays up, disabled, under a hint.
  const entries = session?.entries ?? [];
  const ready = session !== null && snapshot.status === "ready";
  const status = STATUS_LABEL[snapshot.status];
  const speedIndex = ANIMATION_SPEEDS.findIndex((candidate) => candidate === speed);
  const stepSpeed = (direction: -1 | 1): void => {
    const next = ANIMATION_SPEEDS[speedIndex + direction];
    if (next === undefined) return;
    setAnimationSpeed(next);
    session?.setSpeed(next);
  };

  return (
    <div className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
      {!session ? (
        <span className="animation-bar__hint" data-test="animation-hint">Select an element to inspect its animations</span>
      ) : entries.length === 0 ? (
        <span className="animation-bar__hint" data-test="animation-empty">No animations on this element</span>
      ) : status ? (
        <span className="animation-bar__hint" data-test="animation-status">{status}</span>
      ) : null}
      <div className="animation-bar__row">
        <AnimationTimeline
          progress={snapshot.progress}
          duration={snapshot.duration}
          disabled={!ready}
          onSeek={(progress) => session?.seek(progress)}
          onScrubChange={setScrubbing}
        />
      </div>
      <div className="animation-bar__divider" aria-hidden="true" />
      <div className="animation-bar__row">
        <Tooltip content={snapshot.playing ? "Pause" : "Play"} stableTrigger>
          <IconButton
            variant="secondary"
            size="default"
            label={snapshot.playing ? "Pause" : "Play"}
            disabled={!ready}
            data-test="animation-play"
            onClick={() => (snapshot.playing ? session?.pause() : session?.play())}
          >
            {snapshot.playing ? <IconPlayerPauseFilled aria-hidden="true" /> : <IconPlayerPlayFilled aria-hidden="true" />}
          </IconButton>
        </Tooltip>
        <Select
          className="animation-bar__select"
          aria-label="Animation"
          data-test="animation-select"
          placeholder="Choose animation"
          disabled={entries.length === 0}
          value={snapshot.entryId ?? undefined}
          options={entries.map((entry) => ({ value: entry.id, label: entry.label }))}
          onValueChange={(id) => {
            const entry = entries.find((candidate) => candidate.id === id);
            if (entry) session?.run(entry);
          }}
        />
        <div className="animation-bar__speed" role="group" aria-label="Playback speed" data-test="animation-speed">
          <Tooltip content="Slower" stableTrigger>
            <IconButton
              variant="secondary"
              size="default"
              label="Slower"
              disabled={!ready || speedIndex <= 0}
              data-test="animation-speed-down"
              onClick={() => stepSpeed(-1)}
            >
              <IconMinus aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <span className="animation-bar__speed-value" data-test="animation-speed-value" aria-live="polite">{speed}×</span>
          <Tooltip content="Faster" stableTrigger>
            <IconButton
              variant="secondary"
              size="default"
              label="Faster"
              disabled={!ready || speedIndex < 0 || speedIndex >= ANIMATION_SPEEDS.length - 1}
              data-test="animation-speed-up"
              onClick={() => stepSpeed(1)}
            >
              <IconPlus aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
