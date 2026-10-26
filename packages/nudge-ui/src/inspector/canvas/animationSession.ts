import { startInteractionStatePreview } from "../shell/interactionStatePreview.ts";
import { startMotionConditionPreview } from "./animationActivation.ts";
import { scanAnimations, type AnimationEntry, type AnimationTimelineKind } from "./animationScan.ts";

export const ANIMATION_SPEEDS = [0.1, 0.3, 0.5, 1] as const;
/** How long after a trigger new animations are still adopted, for apps that render a frame or two later. */
const CAPTURE_WINDOW_MS = 500;

export interface AnimationSnapshot {
  /** The entry currently captured, or null before one runs. */
  readonly entryId: string | null;
  /** `idle` until a trigger runs, `waiting` for the pointer to leave a hover trigger, `none` once a trigger produced no animation. */
  readonly status: "idle" | "waiting" | "capturing" | "ready" | "none";
  readonly label: string;
  /** Position within the longest captured animation, 0 to 1. */
  readonly progress: number;
  /** Length of the longest captured animation in milliseconds; 0 until one is captured. */
  readonly duration: number;
  /** Scroll-driven groups scrub by scroll progress rather than by wall-clock time. */
  readonly timeline: AnimationTimelineKind;
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
  timeline: "document",
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

/** Progress-based animations expose their time as a CSS percentage and reject absolute millisecond values. */
function isScrollDriven(animation: Animation): boolean {
  const name = animation.timeline?.constructor.name;
  if (name === "ScrollTimeline" || name === "ViewTimeline") return true;
  const current = animation.currentTime;
  return current !== null && typeof current === "object" && "unit" in current && current.unit === "percent";
}

/** Reads the percentage a paused scroll animation is holding. */
function scrollProgressOf(animation: Animation): number {
  const current = animation.currentTime;
  if (current && typeof current === "object" && "unit" in current && current.unit === "percent" && "value" in current) {
    const value = Number(current.value);
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value / 100));
  }
  return 0;
}

/** Seeks a scroll-driven animation by timeline percentage, which is the only seek its progress-based clock accepts. */
function seekScrollAnimation(animation: Animation, progress: number, doc: Document): void {
  const percent = doc.defaultView?.CSS?.percent?.(progress * 100);
  if (!percent) return;
  try {
    animation.currentTime = percent;
  } catch {
    // Browsers without progress-based animation seeking leave the paused frame where it is.
  }
}

/** The element an animation affects; animations on pseudo-elements do not identify a capturable element. */
function animationTarget(animation: Animation): Element | null {
  // SAFETY: KeyframeEffect is the only AnimationEffect with a target; other effects expose no element.
  const target = (animation.effect as KeyframeEffect | null)?.target;
  return target instanceof Element ? target : null;
}

/** One iteration of an infinite animation, so it can still be scrubbed. */
function endTimeOf(animation: Animation): number {
  const timing = animation.effect?.getComputedTiming();
  if (!timing) return 0;
  const end = Number(timing.endTime);
  if (Number.isFinite(end)) return end;
  return Number(timing.delay ?? 0) + Number(timing.duration ?? 0);
}

/** Captures the animations an element runs for one trigger and holds them paused, so they can be played, stepped, scrubbed and slowed without the app's own timing. */
export class AnimationSession {
  private snapshot: AnimationSnapshot = IDLE_ANIMATION_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private captured: Animation[] = [];
  private readonly scrollAnimations = new Set<Animation>();
  private total = 0;
  private captureScope: "element" | "document" = "element";
  /** The trigger, selection and animating members a document-wide capture may adopt. */
  private captureTargets: ReadonlySet<Element> | null = null;
  private stopPreview: (() => void) | null = null;
  private waitFrame: number | null = null;
  private captureFrame: number | null = null;
  private pollFrame: number | null = null;
  private disposed = false;
  private autoplay = false;

  constructor(readonly element: HTMLElement) {}

  /** Reads the element's animations. Kept out of the constructor, which React calls during render, because scanning walks the stylesheets and the computed style of every element it can match. */
  scan(): void {
    if (this.disposed || this.snapshot.entries !== null) return;
    this.publish({ ...this.snapshot, entries: scanAnimations(this.element) });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AnimationSnapshot => this.snapshot;

  /**
   * Runs an entry and captures whatever it starts. Running the current entry again replays it.
   * Captures are held at their first frame, which hides an element that fades or slides in, so
   * `autoplay` lets the animation play through and leave the element at rest.
   */
  run(entry: AnimationEntry, { autoplay = false }: { autoplay?: boolean } = {}): void {
    if (this.disposed) return;
    this.release();
    this.autoplay = autoplay;
    const window = this.element.ownerDocument.defaultView;
    if (!window) return;
    // A trigger the pointer is still over is already hovered, so a forced hover would change nothing to capture.
    // Only the trigger matters: the pointer may rest anywhere else on the page, which the user can't tell apart from "away".
    const trigger = entry.kind === "state" && entry.state === "hover" ? entry.group.trigger : null;
    if (trigger?.matches(":hover")) {
      this.publish({ ...this.snapshot, entryId: entry.id, status: "waiting", label: "", progress: 0, duration: 0, playing: false });
      const wait = (): void => {
        if (this.disposed) return;
        if (trigger.matches(":hover")) {
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
    // A sibling that animates because the selection is its trigger lives outside the selection's subtree.
    this.captureScope = entry.kind === "state"
      && [...entry.group.members.keys()].some((member) => member !== this.element && !this.element.contains(member))
      ? "document"
      : "element";
    this.captureTargets = entry.kind === "state" && this.captureScope === "document"
      ? new Set([this.element, entry.group.trigger, ...entry.group.members.keys()])
      : null;
    // Settle transitions still running from before, so the capture starts from the resting state.
    for (const animation of this.scopeAnimations()) {
      if ("transitionProperty" in animation && this.isCaptureTarget(animation)) animation.cancel();
    }
    const restore = entry.kind === "keyframes" ? this.restartKeyframes(entry.name) : null;
    const baseline = new Set(entry.kind === "running" ? [] : this.scopeAnimations());
    restore?.();
    if (entry.kind === "state") {
      const trigger = entry.group.trigger;
      // Forcing the actual trigger, not the selection, lets a hover over one card animate its sibling.
      if (entry.state) this.stopPreview = startInteractionStatePreview(trigger, entry.state);
      const activation = startMotionConditionPreview(trigger, entry.group.conditions);
      const stopPseudo = this.stopPreview;
      this.stopPreview = () => {
        stopPseudo?.();
        activation();
      };
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
    this.scopeAnimations();
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
    // A scroll-driven animation follows the page's scroll position; only its paused frame is ours to control.
    if (this.isScrollOnly()) return;
    if (this.total > 0 && this.groupTime() >= this.total) this.seekTime(0);
    for (const animation of this.captured) {
      if (this.scrollAnimations.has(animation)) continue;
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
    if (this.isScrollOnly()) {
      for (const animation of this.scrollAnimations) seekScrollAnimation(animation, progress, this.element.ownerDocument);
      const scroll = this.captured.find((animation) => this.scrollAnimations.has(animation));
      const actual = scroll ? scrollProgressOf(scroll) : Math.min(1, Math.max(0, progress));
      this.publish({ ...this.snapshot, progress: actual });
      return;
    }
    this.seekTime(progress * this.total);
    for (const animation of this.scrollAnimations) seekScrollAnimation(animation, progress, this.element.ownerDocument);
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

  private scopeAnimations(): Animation[] {
    return this.captureScope === "document"
      ? this.element.ownerDocument.getAnimations()
      : this.element.getAnimations({ subtree: true });
  }

  private isScrollOnly(): boolean {
    return this.captured.length > 0 && this.captured.every((animation) => this.scrollAnimations.has(animation));
  }

  /** Document scope also sees unrelated page motion; only adopt what the trigger and its group can move. */
  private isCaptureTarget(animation: Animation): boolean {
    if (!this.captureTargets) return true;
    const target = animationTarget(animation);
    if (!target) return false;
    for (const member of this.captureTargets) {
      if (member === target || member.contains(target)) return true;
    }
    return false;
  }

  /** Pauses animations the trigger started and aligns late arrivals with the group's current time. */
  private adopt(baseline: ReadonlySet<Animation>, keepTime: boolean): void {
    const fresh = this.scopeAnimations()
      .filter((animation) => !baseline.has(animation) && !this.captured.includes(animation) && this.isCaptureTarget(animation));
    if (fresh.length === 0) return;
    const first = this.captured.length === 0;
    const time = first ? 0 : this.groupTime();
    const follow = this.autoplay && this.snapshot.playing;
    for (const animation of fresh) {
      animation.pause();
      animation.playbackRate = this.snapshot.speed;
      // A scroll timeline rejects millisecond seeks; it keeps the frame the scroll position gave it.
      if (isScrollDriven(animation)) {
        this.scrollAnimations.add(animation);
        continue;
      }
      if (!keepTime) animation.currentTime = time;
      if (follow) animation.play();
    }
    this.captured.push(...fresh);
    this.total = Math.max(0, ...this.captured.filter((animation) => !this.scrollAnimations.has(animation)).map(endTimeOf));
    const timeline: AnimationTimelineKind = this.isScrollOnly() ? "scroll" : "document";
    const progress = timeline === "scroll" ? scrollProgressOf(fresh[0]!) : this.snapshot.progress;
    this.publish({ ...this.snapshot, status: "ready", label: labelFor(this.captured), duration: timeline === "scroll" ? 0 : this.total, timeline, progress });
    if (first && this.autoplay) this.play();
    else this.startPolling();
  }

  private groupTime(): number {
    return Math.max(0, ...this.captured
      .filter((animation) => !this.scrollAnimations.has(animation))
      .map((animation) => Number(animation.currentTime ?? 0)));
  }

  private seekTime(time: number): void {
    const clamped = Math.min(this.total, Math.max(0, time));
    for (const animation of this.captured) {
      if (!this.scrollAnimations.has(animation)) animation.currentTime = clamped;
    }
    this.publishProgress();
  }

  private publishProgress(): void {
    if (this.isScrollOnly()) {
      const scroll = this.captured.find((animation) => this.scrollAnimations.has(animation));
      const progress = scroll ? scrollProgressOf(scroll) : 0;
      if (progress === this.snapshot.progress && !this.snapshot.playing) return;
      this.publish({ ...this.snapshot, progress, playing: false });
      return;
    }
    const progress = this.total > 0 ? Math.min(1, this.groupTime() / this.total) : 0;
    const playing = this.captured.some((animation) => !this.scrollAnimations.has(animation) && animation.playState === "running");
    if (progress === this.snapshot.progress && playing === this.snapshot.playing) return;
    this.publish({ ...this.snapshot, progress, playing });
  }

  /** True while at least one captured animation is running, which is the only time frames are needed. */
  private isMoving(): boolean {
    return this.captured.some((animation) => !this.scrollAnimations.has(animation) && animation.playState === "running");
  }

  /** Follows playback frame by frame until nothing moves. Seeking publishes its own progress, so a paused or finished group leaves the page with no animation frame loop at all. */
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
    this.autoplay = false;
    for (const animation of this.captured) animation.cancel();
    this.captured = [];
    this.scrollAnimations.clear();
    this.captureScope = "element";
    this.captureTargets = null;
    this.total = 0;
    this.snapshot = { ...this.snapshot, timeline: "document" };
  }

  private publish(next: AnimationSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
