// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommentsOverlay } from "./CommentsOverlay.tsx";
import { clearComments, commentRoute, saveComment, setCommentToolActive } from "./store.ts";
import { commentFingerprint, commentViewport } from "./element.ts";
import { captureRenderedInstance } from "../projection/renderedInstance.ts";
import type { CanvasFrame } from "../canvas/canvasFrame.ts";
import { getPageFrame } from "../canvas/pageSurface.ts";
import { connectFrame } from "../canvas/frameConnection.ts";
import { PROTOCOL_VERSION } from "../canvas/frameProtocol.ts";
import { registerCardFrame, unregisterCardFrame } from "../canvas/projection.ts";
import { setCanvasMode } from "../canvas/viewStore.ts";
import { reconcileComments } from "./verification.ts";

vi.mock("./verification.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("./verification.ts")>(),
  reconcileComments: vi.fn(),
}));

// SAFETY: React's test environment flag is supported by the act API.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(reconcileComments).mockReset().mockResolvedValue(0);
  clearComments();
  setCanvasMode("canvas");
  setCommentToolActive(true);
  Object.defineProperties(document.documentElement, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  unregisterCardFrame("comment-card");
  clearComments();
  setCommentToolActive(false);
  setCanvasMode("inspect");
  Reflect.deleteProperty(document.documentElement, "clientWidth");
  Reflect.deleteProperty(document.documentElement, "clientHeight");
  document.body.replaceChildren();
  vi.useRealTimers();
});

function target(frame: CanvasFrame): HTMLElement {
  const doc = frame.contentDocument!;
  const button = doc.createElement("button");
  button.textContent = "Save";
  button.dataset.cid = "SaveButton";
  button.dataset.src = "src/App.tsx:10:3";
  button.dataset.rendererId = "r1";
  button.getBoundingClientRect = () => new DOMRect(20, 30, 80, 40);
  doc.body.append(button);
  registerCardFrame("comment-card", frame);
  return button;
}

it("opens a comment draft on the page surface without unmounting the overlay", () => {
  const frame = getPageFrame();
  target(frame);
  act(() => root.render(<CommentsOverlay />));

  act(() => window.dispatchEvent(new MessageEvent("message", {
    origin: window.location.origin,
    source: window,
    data: {
      ...connectFrame("comment-card", frame).identity,
      protocolVersion: PROTOCOL_VERSION,
      type: "element-click",
      elementId: "r1",
      cid: "SaveButton",
      src: "src/App.tsx:10:3",
    },
  })));

  const editor = host.querySelector<HTMLElement>('[data-test="comment-editor"]');
  expect(editor).not.toBeNull();
  expect(editor?.style.top).toBe("30px");
  expect(host.querySelector('[data-test="comment-input"]')).not.toBeNull();
});

it.each(["page", "visible iframe", "hidden iframe"])("shows saved pins only on visible surfaces: %s", (surface) => {
  let frame = getPageFrame();
  if (surface !== "page") {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.style.visibility = surface === "hidden iframe" ? "hidden" : "visible";
    iframe.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    frame = iframe;
  }
  const element = target(frame);
  const ref = captureRenderedInstance(element);
  expect(ref).not.toBeNull();
  saveComment({
    id: "saved-note", route: commentRoute(element.ownerDocument), target: ref!,
    tag: "button", note: "Rename Save", baseline: commentFingerprint(element),
    viewport: commentViewport(element.ownerDocument), handedOff: false,
  });

  act(() => root.render(<CommentsOverlay />));

  const pins = host.querySelectorAll('[data-test="comment-pin"]');
  expect(pins).toHaveLength(surface === "hidden iframe" ? 0 : 1);
  if (surface !== "hidden iframe") {
    act(() => pins[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector<HTMLInputElement>('[data-test="comment-input"]')?.value).toBe("Rename Save");
  }
});

it("checks again after a source change that landed while a check was running", async () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  iframe.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const element = target(iframe);
  const ref = captureRenderedInstance(element);
  expect(ref).not.toBeNull();
  saveComment({
    id: "sent-note", route: commentRoute(element.ownerDocument), target: ref!,
    tag: "button", note: "Rename Save", baseline: commentFingerprint(element),
    viewport: commentViewport(element.ownerDocument), handedOff: true,
  });
  let finishFirstCheck!: (removed: number) => void;
  vi.mocked(reconcileComments).mockReturnValueOnce(new Promise((resolve) => { finishFirstCheck = resolve; }));

  act(() => root.render(<CommentsOverlay />));
  expect(reconcileComments).toHaveBeenCalledTimes(1);

  await act(async () => {
    element.textContent = "Saved";
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    finishFirstCheck(0);
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(reconcileComments).toHaveBeenCalledTimes(2);
});
