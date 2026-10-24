import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useSelectedElement } from "../selection/selectionStore.ts";
import { ANIMATION_SPEEDS, AnimationSession, IDLE_ANIMATION_SNAPSHOT } from "./animationSession.ts";
import { AnimationTimeline } from "./AnimationTimeline.tsx";
import { setAnimationBusy, setAnimationSpeed, getAnimationSpeed, useAnimationSpeed } from "./debugViewStore.ts";

const STATUS_LABEL = {
  idle: "",
  waiting: "Move pointer away",
  capturing: "Listening…",
  none: "Didn't animate anything",
  ready: "",
} as const;

const SPEED_OPTIONS = ANIMATION_SPEEDS.map((speed) => ({
  value: String(speed),
  label: `${speed}×`,
  testId: `animation-speed-${speed}`,
}));

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
    // The constructor is cheap so it can run in render; the scan reads stylesheets, so it runs here.
    session.scan();
    session.setSpeed(getAnimationSpeed());
    // A click runs the app's own handlers, so only a described animation starts by itself.
    const first = session.getSnapshot().entries?.[0];
    if (first && first.kind !== "click") session.run(first, { autoplay: true });
    return () => session.dispose();
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
  const entries = snapshot.entries;
  const ready = session !== null && snapshot.status === "ready";
  const status = STATUS_LABEL[snapshot.status];

  return (
    <div className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
      {!session ? (
        <span className="animation-bar__hint" data-test="animation-hint">Select an element to inspect its animations</span>
      ) : entries === null ? null : entries.length === 0 ? (
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
        <SegmentedControl
          aria-label="Playback speed"
          data-test="animation-speed"
          className="animation-bar__speed"
          value={String(speed)}
          options={SPEED_OPTIONS}
          disabled={!ready}
          onChange={(value) => {
            setAnimationSpeed(Number(value));
            session?.setSpeed(Number(value));
          }}
        />
      </div>
    </div>
  );
}
