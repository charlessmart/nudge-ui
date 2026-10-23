import { startInteractionStatePreview } from "../shell/interactionStatePreview.ts";
import { scanAnimations, type AnimationEntry } from "./animationScan.ts";

export const ANIMATION_SPEEDS = [0.1, 0.3, 0.5, 1] as const;
/** How long after a trigger new animations are still adopted, for apps that render a frame or two later. */
const CAPTURE_WINDOW_MS = 500;

export interface AnimationSnapshot {
  /** The entry currently captured, or null before one runs. */
  readonly entryId: string | null;
  /** `idle` until a trigger runs, `waiting` for the pointer to leave the page, `none` once a trigger produced no animation. */
  readonly status: "idle" | "waiting" | "capturing" | "ready" | "none";
  readonly label: string;
  /** Position within the longest captured animation, 0 to 1. */
  readonly progress: number;
  /** Length of the longest captured animation in milliseconds; 0 until one is captured. */
  readonly duration: number;
  readonly playing: boolean;
  readonly speed: number;
  /** What the session offers to run; null until it has scanned the element. */
  readonly entries: readonly AnimationEntry[] | null;
}

export const IDLE_ANIMATION_SNAPSHOT: AnimationSnapshot = {
  entryId: null,
  status: "idle",
  label: "",
  progress: 0,
  duration: 0,
  playing: false,
  speed: 1,
  entries: null,
};

function list(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function animationName(animation: Animation): string {
  if ("transitionProperty" in animation) return String(animation.transitionProperty);
  if ("animationName" in animation) return String(animation.animationName);
  return animation.id || "animate()";
}

function labelFor(animations: readonly Animation[]): string {
  const names = [...new Set(animations.map(animationName))];
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? "";
}

/** One iteration of an infinite animation, so it can still be scrubbed. */
function endTimeOf(animation: Animation): number {
  const timing = animation.effect?.getComputedTiming();
  if (!timing) return 0;
  const end = Number(timing.endTime);
  if (Number.isFinite(end)) return end;
  return Number(timing.delay ?? 0) + Number(timing.duration ?? 0);
}

/**
 * Captures the animations an element runs for one trigger and holds them paused,
 * so they can be played, stepped, scrubbed and slowed without the app's own timing.
 */
export class AnimationSession {
  private snapshot: AnimationSnapshot = IDLE_ANIMATION_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private captured: Animation[] = [];
  private total = 0;
  private stopPreview: (() => void) | null = null;
  private waitFrame: number | null = null;
  private captureFrame: number | null = null;
  private pollFrame: number | null = null;
  private disposed = false;

  constructor(readonly element: HTMLElement) {}

  /**
   * Reads the element's animations. Kept out of the constructor, which React calls during render,
   * because scanning walks the stylesheets and the computed style of every element it can match.
   */
  scan(): void {
    if (this.disposed || this.snapshot.entries !== null) return;
    this.publish({ ...this.snapshot, entries: scanAnimations(this.element) });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AnimationSnapshot => this.snapshot;

  /** Runs an entry and captures whatever it starts. Running the current entry again replays it. */
  run(entry: AnimationEntry): void {
    if (this.disposed) return;
    this.release();
    const window = this.element.ownerDocument.defaultView;
    if (!window) return;
    // A page the pointer is still over is already hovered, so a forced hover would change nothing to capture.
    if (entry.kind === "state" && entry.state === "hover" && this.element.ownerDocument.documentElement.matches(":hover")) {
      this.publish({ ...this.snapshot, entryId: entry.id, status: "waiting", label: "", progress: 0, duration: 0, playing: false });
      const wait = (): void => {
        if (this.disposed) return;
        if (this.element.ownerDocument.documentElement.matches(":hover")) {
          this.waitFrame = window.requestAnimationFrame(wait);
          return;
        }
        this.waitFrame = null;
        this.capture(entry);
      };
      this.waitFrame = window.requestAnimationFrame(wait);
      return;
    }
    this.capture(entry);
  }

  private capture(entry: AnimationEntry): void {
    const window = this.element.ownerDocument.defaultView;
    if (!window) return;
    this.publish({ ...this.snapshot, entryId: entry.id, status: "capturing", label: "", progress: 0, duration: 0, playing: false });
    // Settle transitions still running from before, so the capture starts from the resting state.
    for (const animation of this.subtreeAnimations()) {
      if ("transitionProperty" in animation) animation.cancel();
    }
    const restore = entry.kind === "keyframes" ? this.restartKeyframes(entry.name) : null;
    const baseline = new Set(entry.kind === "running" ? [] : this.subtreeAnimations());
    restore?.();
    if (entry.kind === "state") {
      this.stopPreview = startInteractionStatePreview(this.element, entry.state, { withAncestors: true });
    } else if (entry.kind === "click") {
      this.dispatchClick();
    }

    const startedAt = window.performance.now();
    const poll = (): void => {
      this.captureFrame = null;
      if (this.disposed) return;
      this.adopt(baseline, entry.kind === "running");
      if (window.performance.now() - startedAt < CAPTURE_WINDOW_MS) {
        this.captureFrame = window.requestAnimationFrame(poll);
        return;
      }
      if (this.captured.length === 0) this.publish({ ...this.snapshot, status: "none" });
    };
    poll();
  }

  /** Stops the named keyframe animation on the subtree so restoring it starts it again from the beginning. */
  private restartKeyframes(name: string): () => void {
    const view = this.element.ownerDocument.defaultView;
    const touched: Array<{ readonly target: HTMLElement; readonly previous: string; readonly priority: string }> = [];
    for (const target of [this.element, ...Array.from(this.element.querySelectorAll<HTMLElement>("*"))]) {
      if (!view || !list(view.getComputedStyle(target).animationName).includes(name)) continue;
      touched.push({ target, previous: target.style.getPropertyValue("animation"), priority: target.style.getPropertyPriority("animation") });
      target.style.setProperty("animation", "none", "important");
    }
    // Committing the removal makes restoring it a new animation rather than a no-op.
    void this.element.getBoundingClientRect();
    this.subtreeAnimations();
    return () => {
      for (const { target, previous, priority } of touched) {
        if (previous) target.style.setProperty("animation", previous, priority);
        else target.style.removeProperty("animation");
        if (target.getAttribute("style") === "") target.removeAttribute("style");
      }
    };
  }

  play(): void {
    if (this.captured.length === 0) return;
    if (this.groupTime() >= this.total) this.seekTime(0);
    for (const animation of this.captured) {
      animation.playbackRate = this.snapshot.speed;
      animation.play();
    }
    this.publish({ ...this.snapshot, playing: true });
    this.startPolling();
  }

  pause(): void {
    for (const animation of this.captured) animation.pause();
    this.publish({ ...this.snapshot, playing: false });
  }

  seek(progress: number): void {
    this.pause();
    this.seekTime(progress * this.total);
  }

  setSpeed(speed: number): void {
    for (const animation of this.captured) animation.playbackRate = speed;
    this.publish({ ...this.snapshot, speed });
  }

  dispose(): void {
    this.disposed = true;
    this.release();
    this.listeners.clear();
  }

  private subtreeAnimations(): Animation[] {
    return this.element.getAnimations({ subtree: true });
  }

  /** Pauses animations the trigger started and aligns late arrivals with the group's current time. */
  private adopt(baseline: ReadonlySet<Animation>, keepTime: boolean): void {
    const fresh = this.subtreeAnimations().filter((animation) => !baseline.has(animation) && !this.captured.includes(animation));
    if (fresh.length === 0) return;
    const time = this.captured.length > 0 ? this.groupTime() : 0;
    for (const animation of fresh) {
      animation.pause();
      animation.playbackRate = this.snapshot.speed;
      if (!keepTime) animation.currentTime = time;
    }
    this.captured.push(...fresh);
    this.total = Math.max(...this.captured.map(endTimeOf));
    this.publish({ ...this.snapshot, status: "ready", label: labelFor(this.captured), duration: this.total });
    this.startPolling();
  }

  private groupTime(): number {
    return Math.max(0, ...this.captured.map((animation) => Number(animation.currentTime ?? 0)));
  }

  private seekTime(time: number): void {
    const clamped = Math.min(this.total, Math.max(0, time));
    for (const animation of this.captured) animation.currentTime = clamped;
    this.publishProgress();
  }

  private publishProgress(): void {
    const progress = this.total > 0 ? Math.min(1, this.groupTime() / this.total) : 0;
    const playing = this.captured.some((animation) => animation.playState === "running");
    if (progress === this.snapshot.progress && playing === this.snapshot.playing) return;
    this.publish({ ...this.snapshot, progress, playing });
  }

  /** True while at least one captured animation is running, which is the only time frames are needed. */
  private isMoving(): boolean {
    return this.captured.some((animation) => animation.playState === "running");
  }

  /**
   * Follows playback frame by frame until nothing moves. Seeking publishes its own progress, so a
   * paused or finished group leaves the page with no animation frame loop at all.
   */
  private startPolling(): void {
    if (this.pollFrame !== null) return;
    const window = this.element.ownerDocument.defaultView;
    if (!window) return;
    const poll = (): void => {
      this.pollFrame = null;
      this.publishProgress();
      if (this.disposed || !this.isMoving()) return;
      this.pollFrame = window.requestAnimationFrame(poll);
    };
    this.pollFrame = window.requestAnimationFrame(poll);
  }

  /** Synthetic clicks run the app's handlers but never follow links or submit forms. */
  private dispatchClick(): void {
    const doc = this.element.ownerDocument;
    const synthetic = new (doc.defaultView?.MouseEvent ?? MouseEvent)("click", { bubbles: true, cancelable: true });
    const preventDefault = (event: Event): void => {
      if (event === synthetic) event.preventDefault();
    };
    doc.addEventListener("click", preventDefault, { capture: true });
    try {
      this.element.dispatchEvent(synthetic);
    } finally {
      doc.removeEventListener("click", preventDefault, { capture: true });
    }
  }

  /** Drops the captured animations and the forced state, leaving the page as the app had it. */
  private release(): void {
    const window = this.element.ownerDocument.defaultView;
    if (this.captureFrame !== null) window?.cancelAnimationFrame(this.captureFrame);
    if (this.pollFrame !== null) window?.cancelAnimationFrame(this.pollFrame);
    if (this.waitFrame !== null) window?.cancelAnimationFrame(this.waitFrame);
    this.waitFrame = null;
    this.captureFrame = null;
    this.pollFrame = null;
    this.stopPreview?.();
    this.stopPreview = null;
    for (const animation of this.captured) animation.cancel();
    this.captured = [];
    this.total = 0;
  }

  private publish(next: AnimationSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
