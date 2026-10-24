// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { scanPageAnimations } from "./animationScan.ts";
import { createRendererAnimationMarkers } from "./rendererAnimationMarkers.ts";

function mountPage(): void {
  document.head.innerHTML = `<style>
    .card { transition-property: transform; transition-duration: 200ms; }
    .card:hover { transform: scale(2); }
    .spinner { animation-name: spin; animation-duration: 1s; }
  </style>`;
  document.body.innerHTML = `
    <div class="card" id="card"></div>
    <div class="spinner" id="spinner"></div>
    <div class="still" id="still"></div>
    <div id="${NUDGE_UI_MOUNT_ID}"><div class="card" id="own"></div></div>`;
  for (const element of document.querySelectorAll<HTMLElement>("#card, #spinner, #still")) {
    element.getBoundingClientRect = () => ({ left: 10, top: 30, width: 50, height: 20 } as DOMRect);
  }
}

afterEach(() => {
  vi.useRealTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.getElementById("nudge-ui-animation-markers")?.remove();
});

describe("page animation scan", () => {
  it("finds each element that animates on its own and skips the inspector", () => {
    mountPage();
    const found = scanPageAnimations(document, (element) => element.closest(`#${NUDGE_UI_MOUNT_ID}`) !== null);

    expect(found.map((group) => [group.trigger.id, group.kind, group.label])).toEqual([
      ["card", "state", "Hover · transform"],
      ["spinner", "keyframes", "spin"],
    ]);
  });
});

describe("renderer animation markers", () => {
  it("marks animated elements, selects one on click without letting the page see it, and removes the markers when off", () => {
    mountPage();
    const onPick = vi.fn(() => true);
    const markers = createRendererAnimationMarkers(document, onPick);
    markers.apply(true);

    const container = document.getElementById("nudge-ui-animation-markers")!;
    const labels = [...container.children].map((marker) => (marker as HTMLElement).title);
    expect(labels).toEqual(["Hover · transform", "spin"]);
    expect(container.children[0]!.textContent).toBe("");
    expect(container.children[0]!.querySelector("svg")).not.toBeNull();

    const pageClick = vi.fn();
    document.addEventListener("click", pageClick);
    (container.children[1] as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith(document.getElementById("spinner"));
    expect(pageClick).not.toHaveBeenCalled();
    document.removeEventListener("click", pageClick);

    markers.apply(false);
    expect(document.getElementById("nudge-ui-animation-markers")).toBeNull();
  });

  it("places a marker centered below its element in page coordinates, so scrolling never pins it to the viewport", () => {
    mountPage();
    // The element sits 30px below the viewport top while the page is scrolled 500px.
    Object.defineProperty(window, "scrollY", { configurable: true, value: 500 });
    const markers = createRendererAnimationMarkers(document);
    markers.apply(true);
    const [card] = [...document.getElementById("nudge-ui-animation-markers")!.children] as HTMLElement[];
    expect(card!.style.left).toBe("23px");
    expect(card!.style.top).toBe("558px");

    // An element whose bottom is above the page keeps the marker inside the page, not above it.
    document.getElementById("spinner")!.getBoundingClientRect = () => ({ left: 10, top: -528, width: 50, height: 20 } as DOMRect);
    markers.apply(false);
    markers.apply(true);
    const rerendered = [...document.getElementById("nudge-ui-animation-markers")!.children] as HTMLElement[];
    expect(rerendered[1]!.style.top).toBe("4px");
    markers.dispose();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("rescans after the page changes", () => {
    vi.useFakeTimers();
    mountPage();
    const markers = createRendererAnimationMarkers(document);
    markers.apply(true);

    const added = document.createElement("div");
    added.className = "spinner";
    added.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10 } as DOMRect);
    document.body.append(added);
    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(500);
      expect(document.getElementById("nudge-ui-animation-markers")!.children.length).toBe(3);
      markers.dispose();
    });
  });
});
