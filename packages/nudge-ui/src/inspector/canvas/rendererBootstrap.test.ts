// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRendererIdentity, PROTOCOL_VERSION, setRendererIdentity } from "./frameProtocol.ts";
import { bootstrapRenderer, type RendererBootstrapHandle } from "./rendererBootstrap.ts";
import { installRendererElementSelector } from "./rendererElementSelector.ts";
import { startRendererProjectionDiagnostics } from "./rendererStylesheet.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

vi.mock("./rendererElementSelector.ts", () => ({
  installRendererElementSelector: vi.fn(() => vi.fn()),
}));

vi.mock("./rendererStylesheet.ts", () => ({
  handleReplaceStyles: vi.fn(),
  startRendererProjectionDiagnostics: vi.fn(() => vi.fn()),
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
  it("disposes renderer-owned selector and diagnostics resources", () => {
    const disposeSelector = vi.fn();
    const disposeDiagnostics = vi.fn();
    vi.mocked(installRendererElementSelector).mockReturnValue(disposeSelector);
    vi.mocked(startRendererProjectionDiagnostics).mockReturnValue(disposeDiagnostics);

    handle = bootstrapRenderer();
    handle?.teardown();

    expect(disposeSelector).toHaveBeenCalledOnce();
    expect(disposeDiagnostics).toHaveBeenCalledOnce();
  });

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
    expect(getRendererIdentity()).toBeNull();

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
    expect(getRendererIdentity()).toBeNull();
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

      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: window.parent,
        data: { type: "board-gesture-state", protocolVersion: PROTOCOL_VERSION, enabled: true, ...identity },
      }));

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

  it("publishes refreshed renderer runtime metadata to the controller", () => {
    const previous = getNudgeUiRuntimeConfig();
    setRendererIdentity(identity);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRenderer();

    configureNudgeUiRuntime({ ...previous, tokenGeneration: "hmr-generation" });

    expect(messages(postMessage)).toContainEqual(expect.objectContaining({
      type: "frame-runtime",
      runtime: expect.objectContaining({ tokenGeneration: "hmr-generation" }),
      ...identity,
    }));
    handle?.teardown();
    handle = undefined;
    configureNudgeUiRuntime(previous);
  });

  it("leaves cross-origin self-navigation inside the renderer", () => {
    setRendererIdentity(identity);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRenderer();
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/docs";
    document.body.append(anchor);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    let rendererPreventedNavigation = true;
    anchor.addEventListener("click", (event) => {
      rendererPreventedNavigation = event.defaultPrevented;
      event.preventDefault();
    });

    anchor.dispatchEvent(click);

    expect(rendererPreventedNavigation).toBe(false);
    expect(messages(postMessage).some((message) => message.type === "external-navigation")).toBe(false);
  });
});

describe("bootstrapRenderer link targets", () => {
  function sendLinkTargetState(openInCard: boolean): void {
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "link-target-state", protocolVersion: PROTOCOL_VERSION, openInCard, ...identity },
      origin: window.location.origin,
      source: window,
    }));
  }

  function clickLink() {
    const link = document.createElement("a");
    link.href = "/pricing";
    document.body.append(link);
    let reachedApp = false;
    let defaultPreventedBeforeApp = false;
    // jsdom cannot navigate, so the stand-in app handler records then cancels it.
    link.addEventListener("click", (event) => {
      reachedApp = true;
      defaultPreventedBeforeApp = event.defaultPrevented;
      event.preventDefault();
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    return { reachedApp, defaultPrevented: reachedApp ? defaultPreventedBeforeApp : click.defaultPrevented };
  }

  it("keeps the card's route and asks for a new card while links open in cards", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRenderer();
    dispatchParentReady();

    sendLinkTargetState(true);
    const cardClick = clickLink();
    sendLinkTargetState(false);
    const frameClick = clickLink();

    const intents = messages(postMessage).filter((message) => message.type === "navigation-intent");
    expect(cardClick).toEqual({ reachedApp: false, defaultPrevented: true });
    expect(frameClick).toEqual({ reachedApp: true, defaultPrevented: false });
    expect(intents).toEqual([
      expect.objectContaining({ url: `${window.location.origin}/pricing`, openInCard: true }),
      expect.not.objectContaining({ openInCard: true }),
    ]);
  });
});
