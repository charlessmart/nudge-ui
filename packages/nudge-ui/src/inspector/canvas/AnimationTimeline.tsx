import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from "react";

const MAJOR_STEPS_MS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
/** Aims for about this many labelled marks across the track. */
const TARGET_MAJOR_MARKS = 5;
const MINOR_PER_MAJOR = 20;
/** Marks past this fraction of the track are left unlabelled. */
const LAST_LABEL_FRACTION = 0.8;
/** How long the playhead takes to travel to where the track was pressed. */
const GLIDE_MS = 150;
/** Ends a glide whose frames stall, so the track never sticks mid-travel. */
const GLIDE_BACKSTOP_MS = GLIDE_MS + 50;
/** Playhead and tick widths in CSS; positions run edge to edge by leaving room for their own width. */
const PLAYHEAD_WIDTH_PX = 2;

export interface TimelineTick {
  readonly ms: number;
  readonly major: boolean;
  readonly label: string | null;
}

/** The distance between neighbouring marks, so callers can tell which ones sit beside the playhead. */
export function minorStepMs(ticks: readonly TimelineTick[]): number {
  return ticks.length > 1 ? ticks[1]!.ms - ticks[0]!.ms : 0;
}

/** The distance, in marks, over which a mark's rise has fallen to 1/e of the playhead's own. */
const PROXIMITY_DECAY_MARKS = 2;
/** Marks whose rise falls below this are drawn at rest. */
const MIN_PROXIMITY = 0.05;

/** How much a mark rises toward the playhead's height and darkness, 1 at the playhead and falling off exponentially; null once negligible. */
export function tickProximity(distanceMs: number, minorMs: number): number | null {
  if (!(minorMs > 0)) return null;
  const proximity = Math.exp(-(Math.abs(distanceMs) / minorMs) / PROXIMITY_DECAY_MARKS);
  return proximity < MIN_PROXIMITY ? null : Math.round(proximity * 100) / 100;
}

function formatMarkLabel(ms: number, stepMs: number): string {
  if (ms === 0) return "0";
  if (stepMs >= 1000) return `${ms / 1000}s`;
  return String(ms);
}

/** Ruler marks for a track that spans `durationMs`: labelled majors with minor marks between them. */
export function timelineTicks(durationMs: number): TimelineTick[] {
  if (!(durationMs > 0)) return [];
  const step = MAJOR_STEPS_MS.find((candidate) => durationMs / candidate <= TARGET_MAJOR_MARKS)
    ?? MAJOR_STEPS_MS[MAJOR_STEPS_MS.length - 1]!;
  const minor = step / MINOR_PER_MAJOR;
  const ticks: TimelineTick[] = [];
  for (let index = 0; index * minor <= durationMs; index += 1) {
    const ms = index * minor;
    const major = index % MINOR_PER_MAJOR === 0;
    // Labels sit to the right of their mark, so the last stretch of the track has no room for one.
    ticks.push({ ms, major, label: major && ms <= durationMs * LAST_LABEL_FRACTION ? formatMarkLabel(ms, step) : null });
  }
  return ticks;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Reduced motion drops the glide, so a press jumps the playhead and its marks straight there. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export interface AnimationTimelineProps {
  /** Position within the animation, 0 to 1. */
  readonly progress: number;
  /** Length of the animation the track spans, in milliseconds. */
  readonly duration: number;
  readonly disabled?: boolean;
  readonly onSeek: (progress: number) => void;
  /** Called with true while a pointer is held on the track and false when it is released. */
  readonly onScrubChange?: (scrubbing: boolean) => void;
}

/** A ruler of the animation's length with a playhead; press or drag anywhere on it to scrub. */
export function AnimationTimeline({ progress, duration, disabled = false, onSeek, onScrubChange }: AnimationTimelineProps): ReactElement {
  const scaleRef = useRef<HTMLDivElement>(null);
  const ticks = timelineTicks(duration);
  const minorMs = minorStepMs(ticks);
  // Where the playhead is drawn while it glides to a press; null outside one, so playback and dragging move it, and the marks rising around it, with `progress` exactly.
  const [glideProgress, setGlideProgress] = useState<number | null>(null);
  const glideFrame = useRef(0);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The glide chases the latest seek, so a drag retargets it mid-flight.
  const glideTarget = useRef(progress);
  glideTarget.current = progress;
  const drawnProgress = glideProgress ?? progress;
  const playheadMs = drawnProgress * duration;

  // Marks rise the instant the playhead nears them but ease back down once it passes: a mark is flagged as falling when its rise drops, and stays flagged until it rises again, so a settling mark finishes its ease.
  const proximities = ticks.map((tick) => tickProximity(tick.ms - playheadMs, minorMs));
  const drawn = useRef<{ proximities: readonly (number | null)[]; falling: readonly boolean[] }>({ proximities: [], falling: [] });
  const falling = proximities.map((proximity, index) => {
    const before = drawn.current.proximities[index] ?? null;
    if ((proximity ?? 0) < (before ?? 0)) return true;
    if ((proximity ?? 0) > (before ?? 0)) return false;
    return drawn.current.falling[index] ?? false;
  });
  useEffect(() => {
    drawn.current = { proximities, falling };
  });

  useEffect(() => () => {
    clearTimeout(glideTimer.current);
    cancelAnimationFrame(glideFrame.current);
  }, []);

  const endGlide = (): void => {
    clearTimeout(glideTimer.current);
    cancelAnimationFrame(glideFrame.current);
    setGlideProgress(null);
  };

  /** Travels the playhead, and the marks rising around it, to wherever the track was pressed. */
  const startGlide = (): void => {
    // A press mid-travel restarts from wherever the playhead is currently drawn.
    endGlide();
    if (prefersReducedMotion()) return;
    const from = drawnProgress;
    setGlideProgress(from);
    let startedAt: number | null = null;
    const step = (now: number): void => {
      startedAt ??= now;
      const travelled = Math.min(1, (now - startedAt) / GLIDE_MS);
      if (travelled >= 1) {
        endGlide();
        return;
      }
      // Ease out so the marks climb and settle in step with the travelling playhead.
      setGlideProgress(from + (glideTarget.current - from) * (1 - (1 - travelled) * (1 - travelled)));
      glideFrame.current = requestAnimationFrame(step);
    };
    glideFrame.current = requestAnimationFrame(step);
    glideTimer.current = setTimeout(endGlide, GLIDE_BACKSTOP_MS);
  };

  const progressFromPointer = (event: PointerEvent<HTMLDivElement>): number | null => {
    const rect = scaleRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    // The playhead's own width is the one part of the track it can't sit over.
    const travel = rect.width - PLAYHEAD_WIDTH_PX;
    if (travel <= 0) return null;
    return clamp01((event.clientX - rect.left - PLAYHEAD_WIDTH_PX / 2) / travel);
  };

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const next = progressFromPointer(event);
    if (next !== null) onSeek(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const step = event.shiftKey ? 0.1 : 0.01;
    const next = event.key === "ArrowLeft" ? progress - step
      : event.key === "ArrowRight" ? progress + step
      : event.key === "Home" ? 0
      : event.key === "End" ? 1
      : null;
    if (next === null) return;
    event.preventDefault();
    onSeek(clamp01(next));
  };

  return (
    <div
      className="animation-timeline"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Animation progress"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(progress.toFixed(3))}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "" : undefined}
      data-gliding={glideProgress !== null ? "" : undefined}
      data-test="animation-scrubber"
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onScrubChange?.(true);
        startGlide();
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (disabled) return;
        // Only a captured pointer scrubs; a hovering one leaves the marks to the playhead alone.
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
      onPointerUp={() => onScrubChange?.(false)}
      onPointerCancel={() => onScrubChange?.(false)}
      onLostPointerCapture={() => onScrubChange?.(false)}
      onKeyDown={onKeyDown}
      style={{ "--timeline-progress": drawnProgress } as CSSProperties}
    >
      <div className="animation-timeline__scale" ref={scaleRef}>
        {ticks.map((tick, index) => {
          const proximity = proximities[index]!;
          return (
            <span
              key={tick.ms}
              className={tick.major ? "animation-timeline__tick animation-timeline__tick--major" : "animation-timeline__tick"}
              data-falling={falling[index] ? "" : undefined}
              style={{
                "--tick-position": tick.ms / duration,
                ...(proximity === null ? {} : { "--tick-proximity": proximity }),
              } as CSSProperties}
              aria-hidden="true"
            />
          );
        })}
        {/* Separate from the ticks, so they stay at the top whatever height a tick grows to. */}
        {ticks.map((tick) => tick.label ? (
          <span
            key={`label-${tick.ms}`}
            className="animation-timeline__label"
            // The first label would be cut off by the track edge if it were centred on its mark.
            data-start={tick.ms === 0 ? "" : undefined}
            style={{ "--tick-position": tick.ms / duration } as CSSProperties}
            aria-hidden="true"
          >
            {tick.label}
          </span>
        ) : null)}
        <div className="animation-timeline__playhead" data-test="animation-playhead" aria-hidden="true" />
      </div>
    </div>
  );
}
