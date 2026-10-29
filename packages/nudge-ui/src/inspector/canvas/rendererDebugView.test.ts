// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { DEBUG_VIEW_OFF, isDebugViewState } from "./debugView.ts";
import { chooseXrayRoot, createRendererDebugView } from "./rendererDebugView.ts";

const originalElementFromPoint = document.elementFromPoint;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.elementFromPoint = originalElementFromPoint;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-nudge-ui-debug-outlines");
});

describe("debug view state", () => {
  it("accepts only bounded, complete state", () => {
    expect(isDebugViewState({ outlines: true, xray: false, spacing: true, animationSpeed: 0.25 })).toBe(true);
    expect(isDebugViewState({ outlines: true, xray: false, animationSpeed: 0.25 })).toBe(false);
    expect(isDebugViewState({ outlines: true, xray: false, spacing: false })).toBe(false);
    expect(isDebugViewState({ outlines: "yes", xray: false, spacing: false, animationSpeed: 1 })).toBe(false);
    expect(isDebugViewState({ outlines: true, xray: false, spacing: false, animationSpeed: 0 })).toBe(false);
    expect(isDebugViewState({ outlines: true, xray: false, spacing: false, animationSpeed: 4 })).toBe(false);
  });
});

describe("renderer debug view", () => {
  it("installs and removes the outlines stylesheet without styling the inspector mount", () => {
    const view = createRendererDebugView(document);
    view.apply({ ...DEBUG_VIEW_OFF, outlines: true });

    const style = document.getElementById("nudge-ui-debug-outlines");
    expect(document.documentElement.hasAttribute("data-nudge-ui-debug-outlines")).toBe(true);
    expect(style?.textContent).toContain(`:not(#${NUDGE_UI_MOUNT_ID}):not(#nudge-ui-debug-xray-hover)`);

    view.dispose();
    expect(document.getElementById("nudge-ui-debug-outlines")).toBeNull();
    expect(document.documentElement.hasAttribute("data-nudge-ui-debug-outlines")).toBe(false);
  });

  it("chooses the nearest ancestor with enough layers to explode", () => {
    document.body.innerHTML = `
      <section id="card"><header><h2 id="title">Title</h2><p>Body</p></header><footer><button>Go</button></footer></section>`;
    expect(chooseXrayRoot(document.getElementById("title")!, 1_000_000)?.id).toBe("card");
  });

  describe("explode view", () => {
    const XRAY_ON = { ...DEBUG_VIEW_OFF, xray: true };

    function mountCard(): { card: HTMLElement; title: HTMLElement; outside: HTMLElement } {
      document.body.innerHTML = `
        <section id="card" style="color: red"><header><h2 id="title">Title</h2><p>Body</p></header><footer><button>Go</button></footer></section>
        <aside id="outside"><div><span>One</span><span>Two</span></div><p>Three</p></aside>`;
      const card = document.getElementById("card")!;
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
      return {
        card,
        title: document.getElementById("title")!,
        outside: document.getElementById("outside")!,
      };
    }

    function pointAt(target: Element): void {
      document.elementFromPoint = () => target;
    }

    function click(target: Element): MouseEvent {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      target.dispatchEvent(event);
      return event;
    }

    it("explodes the clicked subtree and puts the app's inline styles back when turned off", () => {
      const { card, title } = mountCard();
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      pointAt(title);

      const event = click(title);
      expect(event.defaultPrevented).toBe(true);
      expect(card.style.getPropertyValue("transform")).toContain("rotateX");
      expect(title.style.getPropertyValue("outline")).not.toBe("");

      view.dispose();
      expect(card.getAttribute("style")).toBe("color: red;");
      expect(title.hasAttribute("style")).toBe(false);
    });

    it("keeps a style the app rewrote while exploded", () => {
      const { card, title } = mountCard();
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      card.style.transform = "scale(2)";
      view.dispose();
      expect(card.style.transform).toBe("scale(2)");
    });

    it("selects a picked layer and animates back", () => {
      vi.useFakeTimers();
      const { card, title } = mountCard();
      const onPick = vi.fn(() => true);
      const view = createRendererDebugView(document, onPick);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      click(title);
      expect(onPick).toHaveBeenCalledWith(title);
      expect(card.style.getPropertyValue("transform")).toBe("");
      expect(card.style.getPropertyValue("z-index")).not.toBe("");

      vi.runAllTimers();
      expect(card.getAttribute("style")).toBe("color: red;");
      view.dispose();
    });

    it("explodes the next clicked element after a layer is selected", () => {
      vi.useFakeTimers();
      const { card, title, outside } = mountCard();
      const view = createRendererDebugView(document, () => true);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);
      click(title);
      vi.runAllTimers();

      pointAt(outside.querySelector("span")!);
      click(outside);
      expect(outside.style.getPropertyValue("transform")).toContain("rotateX");
      expect(card.getAttribute("style")).toBe("color: red;");
      view.dispose();
    });

    it("forces the default cursor only while Explode view is on", () => {
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      expect(document.getElementById("nudge-ui-debug-xray-cursor")?.textContent).toContain("cursor: default !important");
      view.apply(DEBUG_VIEW_OFF);
      expect(document.getElementById("nudge-ui-debug-xray-cursor")).toBeNull();
      view.dispose();
    });

    it("animates back when Explode view is turned off while exploded, and dispose finishes it at once", () => {
      vi.useFakeTimers();
      const { card, title } = mountCard();
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      view.apply(DEBUG_VIEW_OFF);
      expect(card.style.getPropertyValue("transform")).toBe("");
      expect(card.style.getPropertyValue("z-index")).not.toBe("");
      vi.runAllTimers();
      expect(card.getAttribute("style")).toBe("color: red;");

      view.apply(XRAY_ON);
      click(title);
      view.dispose();
      expect(card.getAttribute("style")).toBe("color: red;");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("animates back when a layer cannot be selected and ignores clicks during the collapse", () => {
      vi.useFakeTimers();
      const { card, title, outside } = mountCard();
      const onPick = vi.fn(() => false);
      const view = createRendererDebugView(document, onPick);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      click(title);
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(card.style.getPropertyValue("transform")).toBe("");
      expect(card.style.getPropertyValue("z-index")).not.toBe("");

      pointAt(outside.querySelector("span")!);
      const during = click(outside);
      expect(during.defaultPrevented).toBe(true);
      expect(onPick).toHaveBeenCalledTimes(1);

      vi.runAllTimers();
      expect(card.getAttribute("style")).toBe("color: red;");
      expect(outside.hasAttribute("style")).toBe(false);
      view.dispose();
    });

    it("collapses on a click outside the exploded group without exploding what was clicked", () => {
      vi.useFakeTimers();
      const { card, title, outside } = mountCard();
      const onPick = vi.fn(() => true);
      const view = createRendererDebugView(document, onPick);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      pointAt(outside.querySelector("span")!);
      click(outside);
      expect(onPick).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(card.getAttribute("style")).toBe("color: red;");
      expect(outside.hasAttribute("style")).toBe(false);
      view.dispose();
    });

    it("reports each time a subtree is pulled apart and put back", () => {
      vi.useFakeTimers();
      const { title } = mountCard();
      const phases: boolean[] = [];
      const view = createRendererDebugView(document, () => false, (exploded) => phases.push(exploded));
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);
      expect(phases).toEqual([true]);

      // Collapsing still counts as apart, so the controller keeps its chrome hidden until it is back.
      click(title);
      expect(phases).toEqual([true]);
      vi.runAllTimers();
      expect(phases).toEqual([true, false]);
      view.dispose();
    });

    it("collapses on Escape without letting the app see the key", () => {
      vi.useFakeTimers();
      const { card, title } = mountCard();
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);

      const appKeyDown = vi.fn();
      title.addEventListener("keydown", appKeyDown);
      title.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(appKeyDown).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(card.getAttribute("style")).toBe("color: red;");
      view.dispose();
    });

    it("cancels a pending collapse on dispose", () => {
      vi.useFakeTimers();
      const { card, title } = mountCard();
      const view = createRendererDebugView(document);
      view.apply(XRAY_ON);
      pointAt(title);
      click(title);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      view.dispose();
      expect(card.getAttribute("style")).toBe("color: red;");
      expect(vi.getTimerCount()).toBe(0);
      click(title);
      expect(card.getAttribute("style")).toBe("color: red;");
    });
  });
});
