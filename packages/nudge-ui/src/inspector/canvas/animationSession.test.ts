// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationSession } from "./animationSession.ts";
import { CLICK_ENTRY, scanAnimations, type AnimationEntry } from "./animationScan.ts";

function hoverEntryFor(trigger: HTMLElement): AnimationEntry {
  const group = { id: "state:1:pointer", kind: "state", label: "Hover", trigger, members: new Map([[trigger, new Set(["transform"])]]), state: "hover", name: "" } as const;
  return { id: group.id, kind: "state", label: group.label, state: "hover", group };
}

interface FakeAnimation {
  transitionProperty?: string;
  currentTime: number;
  playbackRate: number;
  playState: "paused" | "running" | "finished";
  effect: { getComputedTiming(): { endTime: number } };
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function fakeAnimation(property: string, endTime: number): FakeAnimation {
  const animation: FakeAnimation = {
    transitionProperty: property,
    currentTime: 0,
    playbackRate: 1,
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime }) },
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

  it("captures animations started by a click, pauses them at the start and scrubs them", () => {
    const session = new AnimationSession(button);
    const clicked = vi.fn();
    button.addEventListener("click", () => {
      clicked();
      live.push(fakeAnimation("background-color", 200), fakeAnimation("transform", 400));
    });

    session.run(CLICK_ENTRY);

    expect(clicked).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({ status: "ready", label: "background-color +1", playing: false });
    expect(live.every((animation) => animation.pause.mock.calls.length > 0 && animation.currentTime === 0)).toBe(true);

    session.seek(0.5);
    expect(live.map((animation) => animation.currentTime)).toEqual([200, 200]);
    session.step(1);
    expect(live[0]!.currentTime).toBe(216);
    session.step(-1);
    expect(live[0]!.currentTime).toBe(200);
    session.seek(1);
    expect(live[1]!.currentTime).toBe(400);
    session.dispose();
  });

  it("applies the chosen speed and restarts from the beginning when played at the end", () => {
    const session = new AnimationSession(button);
    button.addEventListener("click", () => live.push(fakeAnimation("opacity", 100)));
    session.run(CLICK_ENTRY);

    session.setSpeed(0.25);
    expect(live[0]!.playbackRate).toBe(0.25);

    session.seek(1);
    session.play();
    expect(live[0]!.currentTime).toBe(0);
    expect(live[0]!.play).toHaveBeenCalled();
    expect(session.getSnapshot().playing).toBe(true);
    session.dispose();
  });

  it("does not follow a link or submit when it runs a click", () => {
    document.body.innerHTML = `<a id="a" href="#elsewhere">Go</a>`;
    const link = document.getElementById("a") as HTMLAnchorElement;
    link.getAnimations = () => [];
    const session = new AnimationSession(link);
    const seen: boolean[] = [];
    document.addEventListener("click", (event) => seen.push(event.defaultPrevented));

    session.run(CLICK_ENTRY);

    expect(seen).toEqual([true]);
    session.dispose();
  });

  it("reports no animation after the capture window, and cancels what it captured on dispose", () => {
    const session = new AnimationSession(button);
    session.run(CLICK_ENTRY);
    vi.advanceTimersByTime(700);
    expect(session.getSnapshot().status).toBe("none");

    button.addEventListener("click", () => live.push(fakeAnimation("opacity", 100)));
    session.run(CLICK_ENTRY);
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

  it("groups one animation under its trigger, merging hover with focus, and offers a click only where it looks clickable", () => {
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
    const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

    const deck = scanAnimations(byId("deck"));
    expect(deck.map((entry) => entry.label)).toEqual(["spin", "Hover · transform +1"]);
    const group = deck.find((entry) => entry.kind === "state")!;
    expect("group" in group && group.group.trigger).toBe(byId("deck"));
    expect("group" in group && [...group.group.members.keys()].map((member) => member.id)).toEqual(["one", "two"]);

    expect(scanAnimations(byId("one")).map((entry) => entry.label)).toEqual(["Hover · transform +1"]);
    expect(scanAnimations(byId("spin")).map((entry) => entry.label)).toEqual(["spin"]);
    expect(scanAnimations(byId("plain"))).toEqual([]);

    document.body.innerHTML = `<button id="go">Go</button><div id="tab" role="tab"></div><div id="inert"></div>`;
    for (const id of ["go", "tab", "inert"]) byId(id).getAnimations = () => [];
    const clickable = (id: string): boolean => scanAnimations(byId(id)).some((entry) => entry.kind === "click");
    expect([clickable("go"), clickable("tab"), clickable("inert")]).toEqual([true, true, false]);
  });
});
