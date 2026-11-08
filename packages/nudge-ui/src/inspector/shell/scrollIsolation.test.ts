// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isolateInspectorWheel } from "./scrollIsolation.ts";

const hosts: HTMLDivElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function mountScroller(): { host: HTMLDivElement; shadow: ShadowRoot; scroller: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const shadow = host.attachShadow({ mode: "open" });
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "scrollHeight", { value: 400 });
  Object.defineProperty(scroller, "clientHeight", { value: 200 });
  shadow.append(scroller);
  return { host, shadow, scroller };
}

describe("isolateInspectorWheel", () => {
  it("keeps inspector wheel gestures from reaching the page", () => {
    const { shadow, scroller } = mountScroller();
    const cleanup = isolateInspectorWheel(shadow);
    let pageSawWheel = false;
    const pageListener = (event: Event): void => {
      pageSawWheel = true;
      event.preventDefault();
    };
    document.addEventListener("wheel", pageListener);

    try {
      scroller.dispatchEvent(new WheelEvent("wheel", {
        deltaY: 100,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    } finally {
      document.removeEventListener("wheel", pageListener);
      cleanup();
    }

    expect(pageSawWheel).toBe(false);
  });

  it("scrolls the nearest inspector scroller when the page cancels the wheel first", () => {
    const { shadow, scroller } = mountScroller();
    const cleanup = isolateInspectorWheel(shadow);
    // A capture listener on the page runs before the shadow root, as a scroll lock does.
    const pageListener = (event: Event): void => event.preventDefault();
    document.addEventListener("wheel", pageListener, { capture: true });

    try {
      scroller.dispatchEvent(new WheelEvent("wheel", {
        deltaY: 60,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    } finally {
      document.removeEventListener("wheel", pageListener, { capture: true });
      cleanup();
    }

    expect(scroller.scrollTop).toBe(60);
  });
});
