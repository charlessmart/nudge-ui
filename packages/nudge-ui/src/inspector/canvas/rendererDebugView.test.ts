// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { DEBUG_VIEW_OFF, isDebugViewState } from "./debugView.ts";
import { chooseXrayRoot, createRendererDebugView } from "./rendererDebugView.ts";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-nudge-ui-debug-outlines");
});

describe("debug view state", () => {
  it("accepts only bounded, complete state", () => {
    expect(isDebugViewState({ timeScale: 4, outlines: true, xray: false })).toBe(true);
    expect(isDebugViewState({ timeScale: 0.5, outlines: true, xray: false })).toBe(false);
    expect(isDebugViewState({ timeScale: 11, outlines: true, xray: false })).toBe(false);
    expect(isDebugViewState({ timeScale: 2, outlines: "yes", xray: false })).toBe(false);
  });
});

describe("renderer debug view", () => {
  it("installs and removes the outlines stylesheet without styling the inspector mount", () => {
    const view = createRendererDebugView(document);
    view.apply({ ...DEBUG_VIEW_OFF, outlines: true });

    const style = document.getElementById("nudge-ui-debug-outlines");
    expect(document.documentElement.hasAttribute("data-nudge-ui-debug-outlines")).toBe(true);
    expect(style?.textContent).toContain(`:not(#${NUDGE_UI_MOUNT_ID})`);

    view.dispose();
    expect(document.getElementById("nudge-ui-debug-outlines")).toBeNull();
    expect(document.documentElement.hasAttribute("data-nudge-ui-debug-outlines")).toBe(false);
  });

  it("slows app animations and restores their own rate, leaving inspector animations alone", () => {
    document.body.innerHTML = `<div id="app"></div><div id="${NUDGE_UI_MOUNT_ID}"><span id="ui"></span></div>`;
    const animation = (target: Element, playbackRate: number): Animation => {
      return { effect: { target }, playbackRate } as unknown as Animation;
    };
    const app = animation(document.getElementById("app")!, 2);
    const ui = animation(document.getElementById("ui")!, 1);
    const previous = document.getAnimations;
    document.getAnimations = () => [app, ui];
    try {
      const view = createRendererDebugView(document);
      view.apply({ ...DEBUG_VIEW_OFF, timeScale: 4 });
      expect(app.playbackRate).toBe(0.5);
      expect(ui.playbackRate).toBe(1);

      view.apply(DEBUG_VIEW_OFF);
      expect(app.playbackRate).toBe(2);
    } finally {
      document.getAnimations = previous;
    }
  });

  it("chooses the nearest ancestor with enough layers to explode", () => {
    document.body.innerHTML = `
      <section id="card"><header><h2 id="title">Title</h2><p>Body</p></header><footer><button>Go</button></footer></section>`;
    expect(chooseXrayRoot(document.getElementById("title")!, 1_000_000)?.id).toBe("card");
  });
});
