// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flowScenarioName, type FlowScenario } from "../../transport/flows.ts";
import { FLOW_SCENARIO_SCRIPT, installFlowScenario, type InstalledFlowScenario } from "./flowScenario.ts";

/** A window stand-in, since a scenario replaces properties a test must not leave changed on the real one. */
function fakeWindow(scenario: FlowScenario | string | null, stored: Record<string, string> = {}) {
  const realFetch = vi.fn(async () => new Response("server"));
  const store = new Map(Object.entries(stored));
  const real: Storage = {
    get length() { return store.size; },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
  };
  const beacon = vi.fn(() => true);
  const win = {
    name: scenario === null ? "" : typeof scenario === "string" ? scenario : flowScenarioName(scenario),
    fetch: realFetch,
    localStorage: real,
    sessionStorage: real,
    location: new URL("https://app.test/checkout"),
    setTimeout: window.setTimeout.bind(window),
    navigator: { sendBeacon: beacon },
  } as unknown as Window & { __nudgeUiFlowScenario?: InstalledFlowScenario };
  return { win, realFetch, store, beacon };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("installFlowScenario", () => {
  it("leaves a document without a scenario alone", () => {
    const { win, realFetch } = fakeWindow(null);
    installFlowScenario(win);
    expect(win.fetch).toBe(realFetch);
    expect(win.__nudgeUiFlowScenario).toBeUndefined();
  });

  it("leaves a document with an unreadable scenario alone", () => {
    const { win, realFetch } = fakeWindow("nudge-ui-flow-state:{");
    installFlowScenario(win);
    expect(win.fetch).toBe(realFetch);
  });

  it("copies storage, applies the seed and keeps writes inside the frame", () => {
    const { win, store } = fakeWindow({ seed: { localStorage: { cart: "seeded" } } }, { token: "signed-in", cart: "real", "nudge-ui:x": "1" });
    installFlowScenario(win);
    const storage = win.localStorage;
    expect(storage.getItem("token")).toBe("signed-in");
    expect(storage.getItem("cart")).toBe("seeded");
    storage.setItem("cart", "changed");
    (storage as unknown as Record<string, string>).other = "prop";
    expect(storage.getItem("cart")).toBe("changed");
    expect(storage.getItem("other")).toBe("prop");
    expect(Object.keys(storage)).toContain("other");
    expect(store.get("cart")).toBe("real");
    expect(store.has("other")).toBe(false);
    storage.setItem("nudge-ui:x", "2");
    expect(store.get("nudge-ui:x")).toBe("2");
  });

  it("hides the keys a state names, keeps the rest, and still applies the seed", () => {
    const { win } = fakeWindow(
      { hideStorage: ["sb-*-auth-token", "session"], seed: { localStorage: { session: "fixture" } } },
      { "sb-abc-auth-token": "real", session: "real", theme: "dark", "nudge-ui:x": "1" },
    );
    installFlowScenario(win);
    expect(win.localStorage.getItem("sb-abc-auth-token")).toBeNull();
    expect(win.localStorage.getItem("session")).toBe("fixture");
    expect(win.localStorage.getItem("theme")).toBe("dark");
    expect(win.localStorage.getItem("nudge-ui:x")).toBe("1");
  });

  it("starts empty with a * pattern but leaves the inspector's own settings", () => {
    const { win } = fakeWindow({ hideStorage: ["*"] }, { a: "1", b: "2", "nudge-ui:x": "1" });
    installFlowScenario(win);
    expect(win.localStorage.getItem("a")).toBeNull();
    expect(win.localStorage.getItem("b")).toBeNull();
    expect(win.localStorage.getItem("nudge-ui:x")).toBe("1");
  });

  it("counts what each rule answered, so unused ones can be reported", async () => {
    const { win } = fakeWindow({ network: [{ match: "GET /used", json: {} }, { match: "GET /typo-ed", json: {} }] });
    installFlowScenario(win);
    await win.fetch("/used");
    expect(win.__nudgeUiFlowScenario?.rules).toEqual([{ match: "GET /used", hits: 1 }, { match: "GET /typo-ed", hits: 0 }]);
  });

  it("lists the reads that reached a real server, but not the dev server's own modules", async () => {
    const { win } = fakeWindow({});
    installFlowScenario(win);
    await win.fetch("/api/me?x=1");
    await win.fetch("https://x.supabase.co/rest/v1/items");
    await win.fetch("/@vite/client");
    await win.fetch("/src/main.tsx");
    await win.fetch("/__nudge_ui__/flows");
    await win.fetch("/api/me?x=1");
    expect(win.__nudgeUiFlowScenario?.passed).toEqual(["GET /api/me?x=1", "GET https://x.supabase.co/rest/v1/items"]);
  });

  it("flags a relative rule that answered another host, but not an absolute one", async () => {
    const { win } = fakeWindow({ network: [{ match: "POST /auth/v1/token", status: 400 }, { match: "GET https://x.test/ok", status: 204 }] });
    installFlowScenario(win);
    await win.fetch("https://x.supabase.co/auth/v1/token", { method: "POST" });
    await win.fetch("https://x.test/ok");
    await win.fetch("/auth/v1/token", { method: "POST" });
    expect(win.__nudgeUiFlowScenario?.foreign).toEqual(["POST /auth/v1/token -> POST https://x.supabase.co/auth/v1/token"]);
  });

  it("answers matched requests from the rules", async () => {
    const { win, realFetch } = fakeWindow({ network: [
      { match: "POST /api/pay", status: 402, json: { message: "No" } },
      { match: "/api/items/*", text: "items" },
      { match: "POST /graphql", passthrough: true },
      { match: "https://other.test/*", status: 204 },
    ] });
    installFlowScenario(win);
    const paid = await win.fetch("/api/pay", { method: "POST" });
    expect(paid.status).toBe(402);
    expect(await paid.json()).toEqual({ message: "No" });
    expect(await (await win.fetch("https://app.test/api/items/3?x=1")).text()).toBe("items");
    expect((await win.fetch("https://other.test/a")).status).toBe(204);
    await win.fetch("/graphql", { method: "POST" });
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it("blocks writes nothing mocked, and reports them, but lets reads and its own routes through", async () => {
    const { win, realFetch, beacon } = fakeWindow({});
    installFlowScenario(win);
    const blocked = await win.fetch("/api/delete", { method: "DELETE" });
    expect(blocked.status).toBe(503);
    expect(win.navigator.sendBeacon("/track")).toBe(true);
    expect(beacon).not.toHaveBeenCalled();
    expect(win.__nudgeUiFlowScenario?.blocked).toEqual(["DELETE https://app.test/api/delete", "POST https://app.test/track"]);
    await win.fetch("/data");
    await win.fetch("/__nudge_ui__/flows/status", { method: "POST" });
    expect(realFetch).toHaveBeenCalledTimes(2);
  });

  it("lets writes through only when the state allows them", async () => {
    const { win, realFetch } = fakeWindow({ allowMutations: true });
    installFlowScenario(win);
    await win.fetch("/api/delete", { method: "DELETE" });
    expect(realFetch).toHaveBeenCalledOnce();
    expect(win.__nudgeUiFlowScenario?.blocked).toEqual([]);
  });

  it("holds a request open for a loading state", async () => {
    const { win } = fakeWindow({ network: [{ match: "/slow", hold: true }] });
    installFlowScenario(win);
    const settled = vi.fn();
    void win.fetch("/slow").then(settled);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(settled).not.toHaveBeenCalled();
  });

  it("stays self-contained, because hosts serialize it into the page", async () => {
    const { win } = fakeWindow({ network: [{ match: "/x", status: 201 }] });
    new Function("window", FLOW_SCENARIO_SCRIPT)(win);
    expect((await win.fetch("/x")).status).toBe(201);
  });
});

describe("realtime connections", () => {
  class RealSocket { static opened: string[] = []; constructor(url: string) { RealSocket.opened.push(url); } }
  class RealSource { static opened: string[] = []; constructor(url: string) { RealSource.opened.push(url); } }
  const withRealtime = (scenario: FlowScenario) => {
    RealSocket.opened = [];
    RealSource.opened = [];
    const { win } = fakeWindow(scenario);
    Object.assign(win, { WebSocket: RealSocket, EventSource: RealSource, EventTarget, Event, DOMException });
    installFlowScenario(win);
    return win as unknown as { WebSocket: new (url: string) => { readyState: number; url: string; close(): void; send(): void; onclose: ((event: Event) => void) | null }; EventSource: new (url: string, init?: { withCredentials?: boolean }) => { readyState: number; withCredentials: boolean }; __nudgeUiFlowScenario?: InstalledFlowScenario };
  };

  it("holds a connection to another origin in connecting and records it", () => {
    const win = withRealtime({});
    const socket = new win.WebSocket("wss://x.supabase.co/realtime/v1/websocket");
    expect(RealSocket.opened).toEqual([]);
    expect(socket.readyState).toBe(0);
    expect(() => socket.send()).toThrow();
    const closed = vi.fn();
    socket.onclose = closed;
    socket.close();
    expect(socket.readyState).toBe(3);
    expect(closed).toHaveBeenCalledOnce();
    const source = new win.EventSource("https://events.test/stream", { withCredentials: true });
    expect(source.readyState).toBe(0);
    expect(source.withCredentials).toBe(true);
    expect(win.__nudgeUiFlowScenario?.held).toEqual(["WebSocket wss://x.supabase.co/realtime/v1/websocket", "EventSource https://events.test/stream"]);
  });

  it("leaves the page's own origin alone, since dev-server hot reload lives there", () => {
    const win = withRealtime({});
    new win.WebSocket("wss://app.test/?token=abc");
    new win.EventSource("/api/events");
    expect(RealSocket.opened).toEqual(["wss://app.test/?token=abc"]);
    expect(RealSource.opened).toEqual(["/api/events"]);
    expect(win.__nudgeUiFlowScenario?.held).toEqual([]);
  });

  it("opens other origins when the state allows realtime or a passthrough rule names the host", () => {
    const allowed = withRealtime({ allowRealtime: true });
    new allowed.WebSocket("wss://x.test/ws");
    expect(RealSocket.opened).toEqual(["wss://x.test/ws"]);
    const named = withRealtime({ network: [{ match: "GET https://x.test/ws", passthrough: true }] });
    new named.WebSocket("wss://x.test/ws");
    expect(RealSocket.opened).toEqual(["wss://x.test/ws"]);
    expect(named.__nudgeUiFlowScenario?.rules).toEqual([{ match: "GET https://x.test/ws", hits: 1 }]);
  });
});

describe("XMLHttpRequest", () => {
  const original = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  beforeEach(() => { window.name = ""; });
  afterEach(() => {
    XMLHttpRequest.prototype.open = original;
    XMLHttpRequest.prototype.send = originalSend;
    delete (window as unknown as Record<string, unknown>).__nudgeUiFlowScenario;
    window.name = "";
  });

  it("answers from rules and blocks unmocked writes", async () => {
    const realFetch = window.fetch;
    window.name = flowScenarioName({ network: [{ match: "GET /x", status: 201, json: { a: 1 } }] });
    const storages = [Object.getOwnPropertyDescriptor(window, "localStorage"), Object.getOwnPropertyDescriptor(window, "sessionStorage")];
    installFlowScenario(window);
    const request = (method: string, url: string) => new Promise<XMLHttpRequest>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.addEventListener("load", () => resolve(xhr));
      xhr.send();
    });
    const answered = await request("GET", "/x");
    expect(answered.status).toBe(201);
    expect(answered.responseText).toBe('{"a":1}');
    expect((await request("POST", "/y")).status).toBe(503);
    window.fetch = realFetch;
    for (const [index, area] of (["localStorage", "sessionStorage"] as const).entries()) {
      const descriptor = storages[index];
      if (descriptor) Object.defineProperty(window, area, descriptor); else delete (window as unknown as Record<string, unknown>)[area];
    }
  });
});
