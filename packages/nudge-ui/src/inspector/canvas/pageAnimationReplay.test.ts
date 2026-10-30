// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { replayPageAnimations } from "./pageAnimationReplay.ts";

/** jsdom has no Web Animations; replay only reads a target, a timeline, and sets the time and plays. */
function fakeAnimation(target: Element | null, { timeline = "DocumentTimeline", css = false } = {}): Animation & { play: ReturnType<typeof vi.fn> } {
  class Timeline {}
  Object.defineProperty(Timeline, "name", { value: timeline });
  return {
    effect: { target },
    timeline: new Timeline(),
    currentTime: 250,
    play: vi.fn(),
    ...(css ? { animationName: "fade" } : {}),
  } as unknown as Animation & { play: ReturnType<typeof vi.fn> };
}

describe("page animation replay", () => {
  let running: Animation[];

  beforeEach(() => {
    running = [];
    Object.defineProperty(document, "getAnimations", { configurable: true, value: () => running });
    document.body.innerHTML = `<div id="box"></div><div id="${NUDGE_UI_MOUNT_ID}"><i id="own"></i></div>`;
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "getAnimations");
    document.body.innerHTML = "";
    delete (window as Window & { gsap?: unknown }).gsap;
  });

  it("rewinds and plays element animations and transitions", () => {
    const animation = fakeAnimation(document.getElementById("box"));
    running.push(animation);
    replayPageAnimations(document);
    expect(animation.currentTime).toBe(0);
    expect(animation.play).toHaveBeenCalledTimes(1);
  });

  it("leaves CSS animations to the stylesheet restart, scroll-driven animations and the inspector's own", () => {
    const css = fakeAnimation(document.getElementById("box"), { css: true });
    const scroll = fakeAnimation(document.getElementById("box"), { timeline: "ScrollTimeline" });
    const own = fakeAnimation(document.getElementById("own"));
    running.push(css, scroll, own);
    replayPageAnimations(document);
    for (const animation of [css, scroll, own]) {
      expect(animation.currentTime).toBe(250);
      expect(animation.play).not.toHaveBeenCalled();
    }
  });

  it("restarts the page's GSAP timelines", () => {
    const restart = vi.fn();
    (window as Window & { gsap?: unknown }).gsap = { globalTimeline: { getChildren: () => [{ restart }, {}] } };
    replayPageAnimations(document);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("leaves the page's inline styles as they were", () => {
    const box = document.getElementById("box")!;
    box.setAttribute("style", "color: red");
    replayPageAnimations(document);
    expect(box.style.color).toBe("red");
    expect(box.style.getPropertyValue("animation-name")).toBe("");
    expect(document.getElementById("own")!.hasAttribute("style")).toBe(false);
  });
});
