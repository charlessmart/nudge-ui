import { describe, expect, it } from "vitest";
import { flowScenarioName, FLOW_SCENARIO_NAME_PREFIX, parseFlowDefinition, parseFlowStateStatus, pruneFlowStatus, type FlowDefinition, type FlowStateStatus } from "./flows.ts";

const valid = {
  version: 1,
  id: "checkout",
  title: "Checkout",
  states: [
    { id: "cart", label: "Cart", route: "/cart" },
    {
      id: "declined",
      label: "Declined",
      tag: "error",
      route: "/checkout?step=2",
      seed: { localStorage: { cart: "[]" } },
      network: [{ match: "POST /api/pay", status: 402, json: { message: "No" } }],
      steps: [{ fill: { role: "textbox", name: "Name" }, value: "Ada" }, { click: { text: "Pay" } }, { waitFor: { role: "alert" }, timeoutMs: 100 }],
    },
  ],
  edges: [{ from: "cart", to: "declined" }],
};

describe("parseFlowDefinition", () => {
  it("keeps a valid flow and defaults its edges", () => {
    const parsed = parseFlowDefinition(valid);
    expect("flow" in parsed && parsed.flow.states[1]?.steps).toHaveLength(3);
    const withoutEdges = parseFlowDefinition({ ...valid, edges: undefined });
    expect("flow" in withoutEdges && withoutEdges.flow.edges).toEqual([]);
  });

  it.each([
    ["version", { ...valid, version: 2 }, "version"],
    ["cross-origin route", { ...valid, states: [{ id: "a", label: "A", route: "https://evil.test/" }] }, "states[0].route"],
    ["protocol-relative route", { ...valid, states: [{ id: "a", label: "A", route: "//evil.test/" }] }, "states[0].route"],
    ["duplicate ids", { ...valid, states: [valid.states[0], valid.states[0]] }, "unique"],
    ["unknown edge", { ...valid, edges: [{ from: "cart", to: "nope" }] }, "edges[0].to"],
    ["unknown step", { ...valid, states: [{ id: "a", label: "A", route: "/", steps: [{ dance: {} }] }] }, "states[0].steps[0]"],
    ["empty locator", { ...valid, states: [{ id: "a", label: "A", route: "/", steps: [{ click: {} }] }] }, "states[0].steps[0].click"],
  ])("names the problem with %s", (_name, value, expected) => {
    const parsed = parseFlowDefinition(value);
    expect("error" in parsed && parsed.error).toContain(expected);
  });
});

describe("parseFlowStateStatus", () => {
  it("accepts a result and refuses a malformed one", () => {
    const status = { flowId: "a", stateId: "b", ok: true, at: 1, durationMs: 2, blocked: [] };
    expect(parseFlowStateStatus(status)).toEqual(status);
    expect(parseFlowStateStatus({ ...status, flowId: "../x" })).toBeNull();
    expect(parseFlowStateStatus({ ...status, blocked: [1] })).toBeNull();
  });
});

it("carries the scenario after the prefix the head script looks for", () => {
  expect(flowScenarioName({ allowMutations: true })).toBe(`${FLOW_SCENARIO_NAME_PREFIX}{"allowMutations":true}`);
});

describe("state options for real backends", () => {
  const one = (state: Record<string, unknown>) => parseFlowDefinition({ ...valid, states: [{ id: "s", label: "S", route: "/chat", ...state }], edges: [] });

  it("keeps hideStorage, allowRealtime and expectRoute", () => {
    const parsed = one({ hideStorage: ["sb-*", "parley-token"], allowRealtime: true, expectRoute: "/login" });
    expect(parsed).toMatchObject({ flow: { states: [{ hideStorage: ["sb-*", "parley-token"], allowRealtime: true, expectRoute: "/login" }] } });
  });

  it("refuses an expectRoute that leaves the origin and a hideStorage that is not a list", () => {
    expect(one({ expectRoute: "//evil.test/x" })).toMatchObject({ error: expect.stringContaining("expectRoute") });
    expect(one({ expectRoute: "login" })).toMatchObject({ error: expect.stringContaining("expectRoute") });
    expect(one({ hideStorage: "sb-*" })).toMatchObject({ error: expect.stringContaining("hideStorage") });
    expect(one({ hideStorage: [1] })).toMatchObject({ error: expect.stringContaining("hideStorage[0]") });
  });
});

describe("replay diagnostics", () => {
  const base = { flowId: "chat", stateId: "list", ok: true, at: 1, durationMs: 2, blocked: [] };

  it("accepts the optional lists and drops empty ones", () => {
    const parsed = parseFlowStateStatus({ ...base, unusedRules: ["GET /a"], passedThrough: [], foreignMatches: ["r -> GET https://x.test/a"], heldConnections: ["WebSocket wss://x.test"] });
    expect(parsed).toEqual({ ...base, unusedRules: ["GET /a"], foreignMatches: ["r -> GET https://x.test/a"], heldConnections: ["WebSocket wss://x.test"] });
  });

  it("refuses a diagnostics list that is not strings", () => {
    expect(parseFlowStateStatus({ ...base, unusedRules: [1] })).toBeNull();
    expect(parseFlowStateStatus({ ...base, passedThrough: "GET /a" })).toBeNull();
  });
});

describe("pruneFlowStatus", () => {
  const status = (flowId: string, stateId: string): FlowStateStatus => ({ flowId, stateId, ok: false, at: 1, durationMs: 1, blocked: [] });
  const flows = [{ id: "chat", states: [{ id: "list" }, { id: "empty" }] }] as unknown as FlowDefinition[];

  it("drops results for states a file no longer defines", () => {
    const kept = pruneFlowStatus([status("chat", "list"), status("chat", "gone"), status("old-flow", "x")], flows, false);
    expect(kept.map((item) => `${item.flowId}/${item.stateId}`)).toEqual(["chat/list"]);
  });

  it("keeps results for flows it cannot account for while a file fails to parse", () => {
    const kept = pruneFlowStatus([status("chat", "gone"), status("broken", "x")], flows, true);
    expect(kept.map((item) => `${item.flowId}/${item.stateId}`)).toEqual(["broken/x"]);
  });

  it("drops nothing when no flow could be read", () => {
    expect(pruneFlowStatus([status("chat", "list")], [], false)).toHaveLength(1);
  });
});
