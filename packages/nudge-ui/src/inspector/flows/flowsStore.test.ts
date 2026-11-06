// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinition } from "../../transport/flows.ts";
import { addCanvasCard, getCanvasCards, openFlowCards, removeCanvasCard, updateCardUrl } from "../canvas/canvasStore.ts";
import { contentSourceUrl } from "../canvas/frameContent.ts";
import { replayCardFlowState, unexpectedRedirect } from "./flowsStore.ts";

const base = "https://app.test/chat";

describe("unexpectedRedirect", () => {
  it("accepts a frame that stayed on its route", () => {
    expect(unexpectedRedirect("/chat", { route: "/chat?tab=1" }, base)).toBeNull();
  });

  it("reports a redirect the recipe did not expect", () => {
    expect(unexpectedRedirect("/login", { route: "/chat" }, base)).toBe("The frame opened /login instead of /chat.");
  });

  it("accepts a deliberate redirect when the state names where it ends", () => {
    expect(unexpectedRedirect("/login", { route: "/chat", expectRoute: "/login" }, base)).toBeNull();
    expect(unexpectedRedirect("/chat", { route: "/chat", expectRoute: "/login" }, base)).toBe("The frame opened /chat instead of /login.");
  });
});

const flow: FlowDefinition = {
  version: 1,
  id: "connect",
  title: "Connect",
  states: [{ id: "authenticating", label: "Authenticating", route: "/agents/connect" }],
  edges: [],
};

function flowCardId(): string {
  openFlowCards(flow);
  return getCanvasCards().find((card) => card.content.kind === "route" && card.content.flowState)!.id;
}

/** A frame the test controls: where it is, how it was loaded, and where it is sent. */
function frame(pathname: string, navigation: "navigate" | "reload") {
  const win = {
    location: { pathname, href: `${window.location.origin}${pathname}`, replace: vi.fn() },
    performance: { getEntriesByType: () => [{ type: navigation }] },
    setTimeout: window.setTimeout.bind(window),
  };
  return { win, iframe: { contentWindow: win, contentDocument: {} } as unknown as HTMLIFrameElement };
}

function postedStatus(fetch: ReturnType<typeof vi.fn>): { ok: boolean; message?: string } | undefined {
  const call = fetch.mock.calls.find(([url]) => String(url).endsWith("/status"));
  return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
}

describe("flow frames", () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    for (const card of getCanvasCards()) removeCanvasCard(card.id);
    fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keep their route when their steps navigate, while other frames follow their own navigation", () => {
    const flowCard = flowCardId();
    const page = addCanvasCard(`${window.location.origin}/agents`);
    updateCardUrl(flowCard, `${window.location.origin}/agents/codex`);
    updateCardUrl(page.id, `${window.location.origin}/agents/codex`);

    const content = (id: string) => getCanvasCards().find((card) => card.id === id)!.content;
    expect(contentSourceUrl(content(flowCard))).toBe(`${window.location.origin}/agents/connect`);
    expect(contentSourceUrl(content(page.id))).toBe(`${window.location.origin}/agents/codex`);
  });

  it("start over at their route when reloaded where their steps ended", async () => {
    const { win, iframe } = frame("/agents/connect/success", "reload");
    await replayCardFlowState(flowCardId(), iframe);

    expect(win.location.replace).toHaveBeenCalledWith(`${window.location.origin}/agents/connect`);
    expect(postedStatus(fetch)).toBeUndefined();
  });

  it("still report a redirect the recipe did not expect", async () => {
    const { win, iframe } = frame("/login", "navigate");
    await replayCardFlowState(flowCardId(), iframe);

    expect(win.location.replace).not.toHaveBeenCalled();
    expect(postedStatus(fetch)).toMatchObject({ ok: false, message: "The frame opened /login instead of /agents/connect." });
  });

  it("replay as usual when reloaded on their route", async () => {
    const { win, iframe } = frame("/agents/connect", "reload");
    await replayCardFlowState(flowCardId(), iframe);

    expect(win.location.replace).not.toHaveBeenCalled();
    expect(postedStatus(fetch)).toMatchObject({ ok: true });
  });
});
