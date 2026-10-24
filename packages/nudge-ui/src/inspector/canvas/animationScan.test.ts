// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanAnimations, scanPageAnimations } from "./animationScan.ts";

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

describe("application state triggers", () => {
  it("collects transitions and keyframes behind one data attribute into a single replayable group", () => {
    document.head.innerHTML = `<style>
      .bento .card { transition-property: opacity, transform; transition-duration: 200ms; }
      .bento[data-visible="true"] .card { opacity: 1; transform: none; }
      .bento[data-visible="true"] .cursor { animation-name: cursor-in; animation-duration: 1s; }
    </style>`;
    document.body.innerHTML = `<div class="bento" id="bento"><div class="card" id="card"></div><svg class="cursor" id="cursor"></svg></div>`;
    const bento = document.getElementById("bento")!;

    const groups = scanPageAnimations(document);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "state", trigger: bento, state: null, label: "Visible · opacity +2" });
    expect(groups[0]!.conditions).toEqual([{ kind: "attribute", name: "data-visible", value: "true" }]);
    expect([...groups[0]!.members.keys()].map((member) => member.id)).toEqual(["card", "cursor"]);
    expect([...groups[0]!.members.get(document.getElementById("card") as HTMLElement)!]).toEqual(["opacity", "transform"]);
    expect([...groups[0]!.members.get(document.getElementById("cursor") as unknown as HTMLElement)!]).toEqual(["cursor-in"]);
  });

  it("recognises state classes and combines every switch on the same compound", () => {
    document.head.innerHTML = `<style>
      .menu { transition-property: opacity; transition-duration: 200ms; }
      .menu.is-open[data-ready="true"] { opacity: 1; }
      .panel { transition-property: transform; transition-duration: 200ms; }
      .panel { transform: none; }
    </style>`;
    document.body.innerHTML = `<div class="menu" id="menu"></div><div class="panel" id="panel"></div>`;

    const groups = scanPageAnimations(document);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Open + Ready · opacity");
    expect(groups[0]!.conditions).toEqual([
      { kind: "class", name: "is-open" },
      { kind: "attribute", name: "data-ready", value: "true" },
    ]);
    expect(groups[0]!.trigger).toBe(document.getElementById("menu"));
  });

  it("does not mistake an ordinary component class for a state switch", () => {
    document.head.innerHTML = `<style>
      .panel { transition-property: opacity; transition-duration: 200ms; }
      .panel--open { opacity: 1; }
      .card { transition-property: transform; transition-duration: 200ms; }
      .card:hover { transform: none; }
    </style>`;
    document.body.innerHTML = `<div class="panel" id="panel"></div><div class="card" id="card"></div>`;

    const groups = scanPageAnimations(document);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.conditions).toEqual([{ kind: "pseudo", state: "hover" }]);
  });

  it("strips mixed pseudo, class and attribute conditions whatever their order in the selector", () => {
    document.head.innerHTML = `<style>
      .menu .panel { transition-property: opacity; transition-duration: 200ms; }
      .menu[data-ready="true"].is-open:hover .panel { opacity: 1; }
    </style>`;
    document.body.innerHTML = `<div class="menu" id="menu"><div class="panel" id="panel"></div></div>`;

    const [group] = scanPageAnimations(document);

    expect(group).toMatchObject({ label: "Hover + Ready + Open · opacity", trigger: document.getElementById("menu") });
    expect([...group!.members.keys()]).toEqual([document.getElementById("panel")]);
  });

  it("puts a bare state class on the ancestor that the rule expects, even when it is not applied yet", () => {
    document.head.innerHTML = `<style>
      .panel { transition-property: opacity; transition-duration: 200ms; }
      .is-open .panel { opacity: 1; }
    </style>`;
    document.body.innerHTML = `<div id="shell"><div class="panel" id="panel"></div></div>`;

    const [group] = scanPageAnimations(document);

    expect(group).toMatchObject({
      label: "Open · opacity",
      trigger: document.getElementById("shell"),
      conditions: [{ kind: "class", name: "is-open" }],
    });
    expect([...group!.members.keys()]).toEqual([document.getElementById("panel")]);
  });
});

describe("scroll-driven animations", () => {
  it("marks keyframes on a view timeline and labels them as scroll", () => {
    document.head.innerHTML = `<style>
      .parallax { animation-name: drift; animation-duration: 1s; animation-timeline: view(); }
    </style>`;
    document.body.innerHTML = `<div class="parallax" id="parallax"></div>`;

    const [group] = scanPageAnimations(document);

    expect(group).toMatchObject({ kind: "keyframes", label: "Scroll · drift", timeline: "scroll" });
  });

  it("keeps a scroll timeline when the keyframes only apply behind a state", () => {
    document.head.innerHTML = `<style>
      .reveal[data-visible="true"] .parallax {
        animation-name: drift;
        animation-duration: 1s;
        animation-timeline: scroll(nearest);
      }
    </style>`;
    document.body.innerHTML = `<div class="reveal" id="reveal"><div class="parallax" id="parallax"></div></div>`;

    const [group] = scanPageAnimations(document);

    expect(group).toMatchObject({ kind: "state", label: "Visible · drift", timeline: "scroll" });
    expect(group!.members.get(document.getElementById("parallax") as HTMLElement)).toEqual(new Set(["drift"]));
  });
});

describe("animations outside the selection", () => {
  it("links a trigger to a sibling it animates even though the sibling is not in its subtree", () => {
    document.head.innerHTML = `<style>
      .card { transition-property: transform; transition-duration: 200ms; }
      .tooltip { transition-property: opacity; transition-duration: 200ms; }
      .card:hover ~ .tooltip { opacity: 1; }
    </style>`;
    document.body.innerHTML = `<div class="card" id="card"></div><div class="tooltip" id="tooltip"></div>`;
    const card = document.getElementById("card")!;
    const tooltip = document.getElementById("tooltip")!;

    const groups = scanAnimations(card);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "state", label: "Hover · opacity" });
    expect("group" in groups[0]! && groups[0].group.trigger).toBe(card);
    expect("group" in groups[0]! && [...groups[0].group.members.keys()]).toEqual([tooltip]);
  });
});
