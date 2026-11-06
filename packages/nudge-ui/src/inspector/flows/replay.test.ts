// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW_REPLAYING_GLOBAL, locate, replayFlowSteps } from "./replay.ts";

// jsdom lays nothing out, so every element would count as hidden.
Element.prototype.getClientRects = function getClientRects(this: Element) {
  return (this as HTMLElement).hidden ? [] as unknown as DOMRectList : [{}] as unknown as DOMRectList;
};

// jsdom has no CSS namespace.
vi.stubGlobal("CSS", { escape: (value: string) => value });

beforeEach(() => { document.body.innerHTML = ""; });

describe("locate", () => {
  it("finds by implicit role and accessible name, preferring the exact name", () => {
    document.body.innerHTML = `<button>Pay later</button><button aria-label="Pay">$</button><a href="/x">Pay</a>
      <label>Name <input id="name"></label><input placeholder="Email" id="email">`;
    expect(locate(document, { role: "button", name: "pay" })?.getAttribute("aria-label")).toBe("Pay");
    expect(locate(document, { role: "link", name: "Pay" })?.tagName).toBe("A");
    expect(locate(document, { role: "textbox", name: "Name" })?.id).toBe("name");
    expect(locate(document, { role: "textbox", name: "Email" })?.id).toBe("email");
  });

  it("skips hidden elements and returns the deepest element holding the text", () => {
    document.body.innerHTML = `<button hidden>Go</button><div id="outer"><span id="inner">Go now</span></div>`;
    expect(locate(document, { role: "button", name: "Go" })).toBeNull();
    expect(locate(document, { text: "go" })?.id).toBe("inner");
  });

  it("finds by test id and selector", () => {
    document.body.innerHTML = `<i data-testid="a"></i><b data-test="b"></b><u class="c"></u>`;
    expect(locate(document, { testId: "a" })?.tagName).toBe("I");
    expect(locate(document, { testId: "b" })?.tagName).toBe("B");
    expect(locate(document, { selector: ".c" })?.tagName).toBe("U");
  });
});

describe("replayFlowSteps", () => {
  it("drives clicks and fills, waiting for what appears and for buttons to enable", async () => {
    document.body.innerHTML = `<input id="field"><button id="go" disabled>Go</button>`;
    const field = document.getElementById("field") as HTMLInputElement;
    const go = document.getElementById("go") as HTMLButtonElement;
    const events: string[] = [];
    field.addEventListener("input", () => { events.push(`input:${field.value}`); go.disabled = false; });
    go.addEventListener("mousedown", () => events.push("mousedown"));
    go.addEventListener("click", () => {
      events.push(`replaying:${String((window as unknown as Record<string, unknown>)[FLOW_REPLAYING_GLOBAL])}`);
      window.setTimeout(() => { document.body.insertAdjacentHTML("beforeend", `<p role="alert">Done</p>`); }, 30);
    });
    const result = await replayFlowSteps(window, [
      { fill: { selector: "#field" }, value: "Ada" },
      { click: { role: "button", name: "Go" } },
      { waitFor: { role: "alert" } },
    ], 500);
    expect(result).toMatchObject({ ok: true });
    expect(events).toEqual(["input:Ada", "mousedown", "replaying:true"]);
    expect((window as unknown as Record<string, unknown>)[FLOW_REPLAYING_GLOBAL]).toBe(false);
  });

  it("reports which step failed and stops there", async () => {
    let clicked = false;
    document.body.innerHTML = `<button id="later">Later</button>`;
    document.getElementById("later")?.addEventListener("click", () => { clicked = true; });
    const result = await replayFlowSteps(window, [
      { waitMs: 1 },
      { click: { role: "button", name: "Missing" } },
      { click: { role: "button", name: "Later" } },
    ], 40);
    expect(result).toMatchObject({ ok: false, failedStep: 1 });
    expect(result.message).toContain('Step 2: No visible button named "Missing"');
    expect(clicked).toBe(false);
  });

  it("says when a button never enables", async () => {
    document.body.innerHTML = `<button disabled>Go</button>`;
    const result = await replayFlowSteps(window, [{ click: { role: "button", name: "Go" } }], 30);
    expect(result.message).toContain("stayed disabled");
  });
});
