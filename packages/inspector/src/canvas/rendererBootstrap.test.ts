// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, setRendererIdentity } from "./frameProtocol.ts";
import { bootstrapRenderer, type RendererBootstrapHandle } from "./rendererBootstrap.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";

vi.mock("./rendererElementSelector.ts", () => ({
  installRendererElementSelector: vi.fn(),
}));

vi.mock("./rendererStylesheet.ts", () => ({
  handleReplaceStyles: vi.fn(),
  startRendererProjectionDiagnostics: vi.fn(),
}));

const identity = {
  projectId: "project-a",
  workspaceId: "workspace-a",
  cardId: "card-a",
};
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

let handle: RendererBootstrapHandle | undefined;

function messages(postMessage: ReturnType<typeof vi.spyOn>): Array<{ type?: string }> {
  return postMessage.mock.calls
    .map(([message]) => message)
    .filter((message): message is { type?: string } => typeof message === "object" && message !== null);
}

function dispatchParentReady(): void {
  window.dispatchEvent(new MessageEvent("message", {
    data: {
      type: "parent-ready",
      protocolVersion: PROTOCOL_VERSION,
      ...identity,
    },
    origin: window.location.origin,
    source: window,
  }));
}

beforeEach(() => {
  setNudgeUiHostDevFlag(true);
  document.head.innerHTML = "<title>Initial title</title>";
  document.body.innerHTML = "";
});

afterEach(() => {
  handle?.teardown();
  handle = undefined;
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  vi.useRealTimers();
  vi.restoreAllMocks();
  setNudgeUiHostDevFlag(undefined);
});

describe("bootstrapRenderer teardown", () => {
  it("releases owned resources, suppresses late callbacks, and permits a later bootstrap", async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");

    handle = bootstrapRenderer();
    expect(handle).toBeDefined();
    expect(bootstrapRenderer()).toBe(handle);
    expect(window.history.pushState).not.toBe(originalPushState);

    setRendererIdentity(identity);
    window.history.pushState({}, "", "#pending");
    handle?.teardown();
    handle?.teardown();

    await Promise.resolve();
    vi.advanceTimersByTime(5000);
    document.title = "Late title";
    window.dispatchEvent(new Event("popstate"));
    window.dispatchEvent(new Event("hashchange"));
    await Promise.resolve();

    expect(messages(postMessage).filter((message) => message.type === "frame-metadata")).toHaveLength(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);

    const nextHandle = bootstrapRenderer();
    expect(nextHandle).toBeDefined();
    expect(window.history.pushState).not.toBe(originalPushState);
    nextHandle?.teardown();
    handle = undefined;
    expect(window.history.pushState).toBe(originalPushState);
  });

  it("does not cancel a newer history owner when an application replaces the patch", () => {
    setRendererIdentity(identity);
    const applicationPushState = vi.fn(originalPushState);

    handle = bootstrapRenderer();
    expect(handle).toBeDefined();
    window.history.pushState = applicationPushState as typeof window.history.pushState;

    handle?.teardown();

    expect(window.history.pushState).toBe(applicationPushState);
  });

  it("cancels a pending pan frame and removes pan listeners", () => {
    const scheduled: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const cancelAnimationFrame = vi.fn();
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = cancelAnimationFrame;

    try {
      setRendererIdentity(identity);
      const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
      handle = bootstrapRenderer();

      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", cancelable: true }));
      document.body.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 1,
        clientY: 2,
      }));
      document.body.dispatchEvent(new MouseEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: 3,
        clientY: 4,
      }));

      expect(scheduled).toHaveLength(1);
      handle?.teardown();
      scheduled[0]?.(0);

      expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
      expect(messages(postMessage).filter((message) => message.type === "pan-move")).toHaveLength(0);

      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      expect(messages(postMessage).filter((message) => message.type === "pan-modifier")).toHaveLength(1);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
