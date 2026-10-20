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
  it("labels animated elements, selects one on click without letting the page see it, and removes the labels when off", () => {
    mountPage();
    const onPick = vi.fn(() => true);
    const markers = createRendererAnimationMarkers(document, onPick);
    markers.apply(true);

    const container = document.getElementById("nudge-ui-animation-markers")!;
    const labels = [...container.children].map((marker) => marker.textContent);
    expect(labels).toEqual(["Hover · transform", "spin"]);

    const pageClick = vi.fn();
    document.addEventListener("click", pageClick);
    (container.children[1] as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith(document.getElementById("spinner"));
    expect(pageClick).not.toHaveBeenCalled();
    document.removeEventListener("click", pageClick);

    markers.apply(false);
    expect(document.getElementById("nudge-ui-animation-markers")).toBeNull();
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
