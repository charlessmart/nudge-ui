// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationSession } from "./animationSession.ts";
import { scanAnimations, type AnimationEntry } from "./animationScan.ts";

/** A neutral entry for tests that only need the capture pipeline: no keyframes restart and no forced state. */
const RUNNING_ENTRY: AnimationEntry = { id: "running", kind: "running", label: "Running now" };

function hoverEntryFor(trigger: HTMLElement): AnimationEntry {
  const group = { id: "state:1:pointer", kind: "state", label: "Hover", trigger, members: new Map([[trigger, new Set(["transform"])]]), state: "hover", conditions: [{ kind: "pseudo", state: "hover" }], timeline: "document", name: "" } as const;
  return { id: group.id, kind: "state", label: group.label, state: "hover", group };
}

interface FakeAnimation {
  transitionProperty?: string;
  currentTime: number;
  playbackRate: number;
  playState: "paused" | "running" | "finished";
  effect: { target?: Element; getComputedTiming(): { endTime: number } };
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

interface FakeScrollAnimation {
  currentTime: { value: number; unit: "percent" };
  playbackRate: number;
  playState: "paused" | "running" | "finished";
  timeline: { constructor: { name: string } };
  effect: { getComputedTiming(): { endTime: number } };
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function fakeAnimation(property: string, endTime: number, target?: Element): FakeAnimation {
  const animation: FakeAnimation = {
    transitionProperty: property,
    currentTime: 0,
    playbackRate: 1,
    playState: "running",
    effect: { ...(target ? { target } : {}), getComputedTiming: () => ({ endTime }) },
    pause: vi.fn(() => { animation.playState = "paused"; }),
    play: vi.fn(() => { animation.playState = "running"; }),
    cancel: vi.fn(),
  };
  return animation;
}

describe("AnimationSession", () => {
  let button: HTMLButtonElement;
  let live: FakeAnimation[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document.defaultView!.performance, "now").mockImplementation(() => Date.now());
    document.body.innerHTML = `<button id="b">Go</button>`;
    button = document.getElementById("b") as HTMLButtonElement;
    live = [];
    button.getAnimations = () => live as unknown as Animation[];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("captures the animations running on the element, pauses them at the start and scrubs them", () => {
    const session = new AnimationSession(button);
    live.push(fakeAnimation("background-color", 200), fakeAnimation("transform", 400));

    session.run(RUNNING_ENTRY);

    expect(session.getSnapshot()).toMatchObject({ status: "ready", label: "background-color +1", playing: false });
    expect(live.every((animation) => animation.pause.mock.calls.length > 0 && animation.currentTime === 0)).toBe(true);

    session.seek(0.5);
    expect(live.map((animation) => animation.currentTime)).toEqual([200, 200]);
    session.seek(1);
    expect(live[1]!.currentTime).toBe(400);
    session.dispose();
  });

  it("applies the chosen speed and restarts from the beginning when played at the end", () => {
    const session = new AnimationSession(button);
    live.push(fakeAnimation("opacity", 100));
    session.run(RUNNING_ENTRY);

    session.setSpeed(0.25);
    expect(live[0]!.playbackRate).toBe(0.25);

    session.seek(1);
    session.play();
    expect(live[0]!.currentTime).toBe(0);
    expect(live[0]!.play).toHaveBeenCalled();
    expect(session.getSnapshot().playing).toBe(true);
    session.dispose();
  });

  it("plays an autoplayed capture instead of holding it at its first frame", () => {
    const session = new AnimationSession(button);
    live.push(fakeAnimation("opacity", 100));
    session.run(RUNNING_ENTRY, { autoplay: true });

    expect(session.getSnapshot()).toMatchObject({ status: "ready", playing: true });
    expect(live[0]!.play).toHaveBeenCalled();
    session.dispose();
  });

  it("reports no animation after the capture window, and cancels what it captured on dispose", () => {
    const session = new AnimationSession(button);
    session.run(RUNNING_ENTRY);
    vi.advanceTimersByTime(700);
    expect(session.getSnapshot().status).toBe("none");

    live.push(fakeAnimation("opacity", 100));
    session.run(RUNNING_ENTRY);
    const captured = live[0]!;
    session.dispose();
    expect(captured.cancel).toHaveBeenCalled();
  });

  it("waits for the pointer to leave the page before capturing a hover", () => {
    let pointerOver = true;
    vi.spyOn(document.documentElement, "matches").mockImplementation((selector: string) => selector === ":hover" && pointerOver);
    const session = new AnimationSession(button);

    session.run(hoverEntryFor(button));
    expect(session.getSnapshot().status).toBe("waiting");

    pointerOver = false;
    vi.advanceTimersByTime(50);
    expect(session.getSnapshot().status).toBe("capturing");
    session.dispose();
  });

  it("scans on demand rather than in the constructor, so render stays cheap", () => {
    const session = new AnimationSession(button);
    expect(session.getSnapshot().entries).toBeNull();

    session.scan();
    expect(session.getSnapshot().entries).toEqual([]);
    session.dispose();
  });

  it("stops asking for frames once nothing is moving", () => {
    const session = new AnimationSession(button);
    live.push(fakeAnimation("opacity", 100));
    session.run(RUNNING_ENTRY);
    // Let the capture window finish, so only playback frames are counted.
    vi.advanceTimersByTime(700);

    const requestFrame = vi.spyOn(document.defaultView!, "requestAnimationFrame");
    session.play();
    session.pause();
    const parked = requestFrame.mock.calls.length;

    vi.advanceTimersByTime(1000);
    expect(requestFrame.mock.calls.length).toBe(parked);
    session.dispose();
  });

  it("gives each state its own movement", async () => {
    document.head.innerHTML = `<style>
      .deck { position: relative; }
      .card { transition-property: transform, opacity; transition-duration: 200ms; }
      .deck:hover .card { transform: scale(2); }
      .deck:focus-visible .card { opacity: 0.5; }
      .spinner { animation-name: spin; animation-duration: 1s; }
      .plain:hover { color: red; }
    </style>`;
    document.body.innerHTML = `<div class="deck" id="deck"><div class="card" id="one"></div><div class="card" id="two"><i class="spinner" id="spin"></i></div></div><span class="plain" id="plain"></span>`;
    for (const element of document.querySelectorAll<HTMLElement>("*")) element.getAnimations = () => [];
    // The stylesheet walk caches per revision, which a MutationObserver bumps a microtask after a write.
    await Promise.resolve();
    const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

    const deck = scanAnimations(byId("deck"));
    // One entry per movement: forcing hover must not claim the opacity that only focus sets off.
    expect(deck.map((entry) => entry.label)).toEqual(["spin", "Hover · transform", "Focus · opacity"]);
    const states = deck.filter((entry) => entry.kind === "state");
    expect(states.map((entry) => "group" in entry && entry.state)).toEqual(["hover", "focus-visible"]);
    for (const entry of states) {
      expect("group" in entry && entry.group.trigger).toBe(byId("deck"));
      expect("group" in entry && [...entry.group.members.keys()].map((member) => member.id)).toEqual(["one", "two"]);
    }

    expect(scanAnimations(byId("one")).map((entry) => entry.label)).toEqual(["Hover · transform", "Focus · opacity"]);
    expect(scanAnimations(byId("spin")).map((entry) => entry.label)).toEqual(["spin"]);
    expect(scanAnimations(byId("plain"))).toEqual([]);

  });

  it("replays an attribute-gated state even when it is already applied", async () => {
    document.head.innerHTML = `<style>
      .bento .card { transition-property: opacity; transition-duration: 200ms; }
      .bento[data-visible="true"] .card { opacity: 1; }
    </style>`;
    document.body.innerHTML = `<div class="bento" id="bento" data-visible="true"><div class="card" id="card"></div></div>`;
    const bento = document.getElementById("bento")!;
    bento.getAnimations = () => [];
    await Promise.resolve();
    const session = new AnimationSession(bento);
    session.scan();
    const entry = session.getSnapshot().entries?.find((candidate) => candidate.kind === "state" && candidate.label.startsWith("Visible"));
    expect(entry).toBeDefined();

    const order: string[] = [];
    const removeAttribute = bento.removeAttribute.bind(bento);
    const setAttribute = bento.setAttribute.bind(bento);
    vi.spyOn(bento, "removeAttribute").mockImplementation((name) => {
      if (name === "data-visible") order.push("remove");
      removeAttribute(name);
    });
    vi.spyOn(bento, "setAttribute").mockImplementation((name, value) => {
      if (name === "data-visible") order.push(`set:${value}`);
      setAttribute(name, value);
    });

    session.run(entry!);

    expect(order).toEqual(["remove", "set:true"]);
    expect(bento.getAttribute("data-visible")).toBe("true");
    session.dispose();
    expect(bento.getAttribute("data-visible")).toBe("true");
  });

  it("scrubs a scroll-driven animation by percentage and leaves play to the page's scroll", () => {
    const target = button;
    const scroll: FakeScrollAnimation = {
      currentTime: { value: 0, unit: "percent" },
      playbackRate: 1,
      playState: "running",
      timeline: { constructor: { name: "ViewTimeline" } },
      effect: { getComputedTiming: () => ({ endTime: 0 }) },
      pause: vi.fn(() => { scroll.playState = "paused"; }),
      play: vi.fn(),
      cancel: vi.fn(),
    };
    const css = { percent: (value: number) => ({ value, unit: "percent" as const }) };
    Object.defineProperty(document.defaultView!, "CSS", { configurable: true, value: css });
    const session = new AnimationSession(target);
    live.push(scroll as unknown as FakeAnimation);

    session.run(RUNNING_ENTRY);

    expect(session.getSnapshot()).toMatchObject({ status: "ready", timeline: "scroll", duration: 0, progress: 0 });
    session.seek(0.5);
    expect(scroll.currentTime).toEqual({ value: 50, unit: "percent" });
    expect(session.getSnapshot().progress).toBe(0.5);
    session.play();
    expect(scroll.play).not.toHaveBeenCalled();
    expect(session.getSnapshot().playing).toBe(false);
    session.dispose();
    Reflect.deleteProperty(document.defaultView!, "CSS");
  });

  it("captures only the sibling group from the document scope, not unrelated page motion", () => {
    const trigger = button;
    const member = document.createElement("div");
    const unrelated = document.createElement("div");
    document.body.append(member, unrelated);
    const group = {
      id: "state:1:opened",
      kind: "state",
      label: "Opened · opacity",
      trigger,
      members: new Map([[member, new Set(["opacity"])]]),
      state: null,
      conditions: [{ kind: "attribute", name: "data-open", value: "true" }],
      timeline: "document",
      name: "",
    } as const;
    const entry: AnimationEntry = { id: group.id, kind: "state", label: group.label, state: null, group };
    const documentAnimations: Animation[] = [];
    const ambient = fakeAnimation("transform", 300, unrelated);
    documentAnimations.push(ambient as unknown as Animation);
    const descriptor = Object.getOwnPropertyDescriptor(document, "getAnimations");
    Object.defineProperty(document, "getAnimations", { configurable: true, value: () => documentAnimations });
    const setAttribute = trigger.setAttribute.bind(trigger);
    const unrelatedAnimation = fakeAnimation("color", 400, unrelated);
    vi.spyOn(trigger, "setAttribute").mockImplementation((name, value) => {
      setAttribute(name, value);
      if (name === "data-open" && value === "true") {
        documentAnimations.push(
          fakeAnimation("opacity", 200, member) as unknown as Animation,
          unrelatedAnimation as unknown as Animation,
        );
      }
    });
    const session = new AnimationSession(trigger);

    session.run(entry);

    expect(session.getSnapshot()).toMatchObject({ status: "ready", label: "opacity", duration: 200 });
    expect(ambient.cancel).not.toHaveBeenCalled();
    expect(unrelatedAnimation.cancel).not.toHaveBeenCalled();
    session.dispose();
    expect(unrelatedAnimation.cancel).not.toHaveBeenCalled();
    if (descriptor) Object.defineProperty(document, "getAnimations", descriptor);
    else Reflect.deleteProperty(document, "getAnimations");
  });
});
