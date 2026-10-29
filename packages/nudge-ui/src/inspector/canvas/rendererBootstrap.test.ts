// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRendererIdentity, PROTOCOL_VERSION, setRendererIdentity } from "./frameProtocol.ts";
import { bootstrapRenderer, type RendererBootstrapHandle, type RendererBootstrapResources } from "./rendererBootstrap.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

// The element selector and diagnostics own real DOM listeners; browser tests supply inert resources.
function bootstrapRendererForTest(resources: RendererBootstrapResources = {}): RendererBootstrapHandle | undefined {
  return bootstrapRenderer({
    installElementSelector: () => () => undefined,
    startProjectionDiagnostics: () => () => undefined,
    ...resources,
  });
}

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

    handle = bootstrapRendererForTest({
      installElementSelector: () => disposeSelector,
      startProjectionDiagnostics: () => disposeDiagnostics,
    });
    handle?.teardown();

    expect(disposeSelector).toHaveBeenCalledOnce();
    expect(disposeDiagnostics).toHaveBeenCalledOnce();
  });

  it("releases owned resources, suppresses late callbacks, and permits a later bootstrap", async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");

    handle = bootstrapRendererForTest();
    expect(handle).toBeDefined();
    expect(bootstrapRendererForTest()).toBe(handle);
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

    const nextHandle = bootstrapRendererForTest();
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

    handle = bootstrapRendererForTest();
    expect(handle).toBeDefined();
    window.history.pushState = applicationPushState as typeof window.history.pushState;

    handle?.teardown();

    expect(window.history.pushState).toBe(applicationPushState);
  });

  it("routes scrolling to board panning only when enabled and preserves modified-wheel zoom", () => {
    setRendererIdentity(identity);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRendererForTest();
    const setGestures = (enabled: boolean, panScroll: boolean) => window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: window.parent,
      data: { type: "board-gesture-state", protocolVersion: PROTOCOL_VERSION, enabled, panScroll, ...identity },
    }));
    setGestures(true, true);
    const wheel = new WheelEvent("wheel", { deltaX: 2, deltaY: 3, deltaMode: 1, cancelable: true });
    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({ type: "wheel-pan", deltaX: 32, deltaY: 48 }));
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 2, shiftKey: true, deltaMode: 1, cancelable: true }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({ type: "wheel-pan", deltaX: 32, deltaY: 0 }));

    setGestures(true, false);
    const native = new WheelEvent("wheel", { deltaY: 50, cancelable: true });
    const before = postMessage.mock.calls.length;
    window.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
    expect(postMessage.mock.calls).toHaveLength(before);
    const zoom = new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, cancelable: true });
    window.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({ type: "zoom", deltaY: -50 }));

    setGestures(false, false);
    const focus = new WheelEvent("wheel", { deltaY: 50, ctrlKey: true, cancelable: true });
    window.dispatchEvent(focus);
    expect(focus.defaultPrevented).toBe(false);
  });

  it("keeps Space-drag panning while the app takes native wheel input", () => {
    setRendererIdentity(identity);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRendererForTest();
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: { type: "board-gesture-state", protocolVersion: PROTOCOL_VERSION, enabled: true, panScroll: false, spacePan: true, ...identity },
    }));

    const space = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);

    const wheel = new WheelEvent("wheel", { deltaY: 40, cancelable: true });
    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);

    document.body.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
      clientY: 20,
    }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({
      type: "pan-start",
      point: { x: 10, y: 20 },
    }));
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
      handle = bootstrapRendererForTest();

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
    handle = bootstrapRendererForTest();

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
    handle = bootstrapRendererForTest();
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

describe("bootstrapRenderer app interaction", () => {
  it("reports the A key while focus is inside the iframe", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRendererForTest();
    dispatchParentReady();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a" }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({ type: "app-interaction-modifier", held: true }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft", key: "Shift" }));
    expect(messages(postMessage).filter((message) => message.type === "app-interaction-modifier")).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "a" }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({ type: "app-interaction-modifier", held: false }));
  });

  it("preserves Shift-modified link clicks for the application", () => {
    handle = bootstrapRendererForTest();
    dispatchParentReady();
    const link = document.createElement("a");
    link.href = "/pricing";
    const child = document.createElement("span");
    link.append(child);
    document.body.append(link);
    let receivedShift = false;
    link.addEventListener("click", (event) => {
      receivedShift = event.shiftKey;
      event.preventDefault();
    });

    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "board-gesture-state", protocolVersion: PROTOCOL_VERSION, enabled: true, panScroll: false, ...identity },
      origin: window.location.origin,
      source: window,
    }));
    child.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));

    expect(receivedShift).toBe(true);
  });

  function sendLinkPreviewState(enabled: boolean): void {
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "link-preview-state", protocolVersion: PROTOCOL_VERSION, enabled, ...identity },
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

  it("leaves ordinary link navigation to the application", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRendererForTest();
    dispatchParentReady();

    sendLinkPreviewState(true);
    const click = clickLink();

    const intents = messages(postMessage).filter((message) => message.type === "navigation-intent");
    expect(click).toEqual({ reachedApp: true, defaultPrevented: false });
    expect(intents).toEqual([
      expect.objectContaining({ url: `${window.location.origin}/pricing` }),
    ]);
    expect(intents[0]).not.toHaveProperty("openInCard");
  });

  it("previews hovered links only while link previews are enabled", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    handle = bootstrapRendererForTest();
    dispatchParentReady();

    const link = document.createElement("a");
    link.href = "/pricing";
    const child = document.createElement("span");
    link.append(child);
    document.body.append(link);
    vi.spyOn(link, "getBoundingClientRect").mockReturnValue({
      left: 10, top: 20, width: 80, height: 16, right: 90, bottom: 36, x: 10, y: 20, toJSON: () => ({}),
    } as DOMRect);

    child.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    expect(messages(postMessage).filter((message) => message.type === "link-preview")).toHaveLength(0);

    sendLinkPreviewState(true);
    child.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({
      type: "link-preview",
      url: `${window.location.origin}/pricing`,
      rect: { left: 10, top: 20, width: 80, height: 16 },
    }));

    child.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    expect(messages(postMessage).filter((message) => message.type === "link-preview").at(-1))
      .toEqual(expect.objectContaining({ type: "link-preview", url: null, rect: null }));

    child.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    sendLinkPreviewState(false);
    expect(messages(postMessage).filter((message) => message.type === "link-preview").at(-1))
      .toEqual(expect.objectContaining({ type: "link-preview", url: null, rect: null }));
  });
});
