import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useSelectedElement } from "../selection/selectionStore.ts";
import { ANIMATION_SPEEDS, AnimationSession, IDLE_ANIMATION_SNAPSHOT } from "./animationSession.ts";
import { AnimationTimeline } from "./AnimationTimeline.tsx";
import { warnAboutUnreadableStylesheets } from "./unreadableStylesheetWarning.ts";
import { setAnimationBarHeight, setAnimationBusy, setAnimationSpeed, getAnimationSpeed, useAnimationSpeed } from "./debugViewStore.ts";

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

/** The bar's height from its floating hint, which sits outside the bar's box, down to its bottom edge. */
function measureBar(bar: HTMLElement): void {
  const rect = bar.getBoundingClientRect();
  const hint = bar.querySelector(".animation-bar__hint")?.getBoundingClientRect();
  setAnimationBarHeight(Math.round(rect.bottom - Math.min(rect.top, hint?.top ?? rect.top)));
}

/** Floats above the canvas toolbar while the Animation tool is active. */
export function AnimationBar(): ReactElement | null {
  const speed = useAnimationSpeed();
  const selected = useSelectedElement();
  const element = selected?.domElement ?? null;
  const session = useMemo(() => (element ? new AnimationSession(element) : null), [element]);
  // The page's document: the selection's in a Canvas frame, and the inspector's own when it runs inside the page.
  const pageDocument = element?.ownerDocument ?? document;

  useEffect(() => warnAboutUnreadableStylesheets(pageDocument), [pageDocument]);

  useEffect(() => {
    if (!session) return;
    // The constructor is cheap so it can run in render; the scan reads stylesheets, so it runs here.
    session.scan();
    session.setSpeed(getAnimationSpeed());
    const first = session.getSnapshot().entries?.[0];
    if (first) session.run(first, { autoplay: true });
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
  const scrollDriven = snapshot.timeline === "scroll";
  const status = STATUS_LABEL[snapshot.status];
  let hint: { readonly test: string; readonly text: string } | null = null;
  if (!session) hint = { test: "animation-hint", text: "Select an element to inspect its animations" };
  else if (entries?.length === 0) hint = { test: "animation-empty", text: "No animations on this element" };
  else if (entries && status) hint = { test: "animation-status", text: status };
  else if (entries && scrollDriven) hint = { test: "animation-scroll-hint", text: "Scroll-driven · scrub the timeline" };

  // Toasts read the bar's height, from its floating hint down, to stay clear of it. Playback re-renders every frame, so
  // this measures only when the hint changes or the bar resizes, never per render.
  const barRef = useRef<HTMLDivElement>(null);
  const hintText = hint?.text ?? null;
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (bar) measureBar(bar);
  }, [hintText]);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const observer = bar && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureBar(bar)) : null;
    if (bar) observer?.observe(bar);
    return () => {
      observer?.disconnect();
      setAnimationBarHeight(0);
    };
  }, []);

  return (
    <div ref={barRef} className="animation-bar" data-test="animation-bar" role="toolbar" aria-label="Animation controls">
      {hint ? <span className="animation-bar__hint" data-test={hint.test}>{hint.text}</span> : null}
      <div className="animation-bar__row">
        <AnimationTimeline
          progress={snapshot.progress}
          duration={snapshot.duration}
          mode={scrollDriven ? "scroll" : "time"}
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
            disabled={!ready || scrollDriven}
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
          disabled={!ready || scrollDriven}
          onChange={(value) => {
            setAnimationSpeed(Number(value));
            session?.setSpeed(Number(value));
          }}
        />
      </div>
    </div>
  );
}
