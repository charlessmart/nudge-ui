// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanPageAnimations } from "./animationScan.ts";

const CONTROLLED_MOTION = `<style>
  .card { transition-property: transform, opacity; transition-duration: 200ms; }
  .card:hover { transform: scale(2); }
  .card:focus { opacity: 0.5; }
</style>`;

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("state groups", () => {
  it("keeps states that move something else apart, so running one animates what it names", () => {
    document.head.innerHTML = CONTROLLED_MOTION;
    document.body.innerHTML = `<div class="card" id="card"></div>`;
    const card = document.getElementById("card")!;

    const groups = scanPageAnimations(document);

    expect(groups.map((group) => [group.label, group.state])).toEqual([
      ["Hover · transform", "hover"],
      ["Focus · opacity", "focus"],
    ]);
    expect(groups.every((group) => group.trigger === card)).toBe(true);
    expect(groups.map((group) => [...group.members.get(card)!])).toEqual([["transform"], ["opacity"]]);
  });

  it("collapses a state that restates another's movement onto the one a person tries first", () => {
    document.head.innerHTML = `<style>
      .card { transition-property: transform; transition-duration: 200ms; }
      .card:focus { transform: scale(2); }
      .card:hover { transform: scale(2); }
    </style>`;
    document.body.innerHTML = `<div class="card" id="card"></div>`;
    const card = document.getElementById("card")!;

    const groups = scanPageAnimations(document);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "state", label: "Hover · transform", state: "hover" });
    expect(groups[0]!.trigger).toBe(card);
  });
});

describe("scan cost", () => {
  it("reads the computed style only of elements that declare motion", () => {
    document.head.innerHTML = `<style>
      .mover { transition-property: transform; transition-duration: 200ms; }
      .mover:hover { transform: scale(2); }
    </style>`;
    document.body.innerHTML = `<div class="mover" id="mover"></div><div id="still"></div><p id="also-still">Text</p>`;
    const computed = vi.spyOn(document.defaultView!, "getComputedStyle");

    scanPageAnimations(document);

    const measured = computed.mock.calls.map((call) => (call[0] as HTMLElement).id);
    expect([...new Set(measured)]).toEqual(["mover"]);
  });
});
