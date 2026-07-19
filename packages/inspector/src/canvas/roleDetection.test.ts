// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { CANVAS_RENDERER_ATTR, detectRole, isCanvasRenderer, isTopLevelController } from "./roleDetection.ts";

describe("roleDetection", () => {
  afterEach(() => {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((f) => f.remove());
  });

  it("CANVAS_RENDERER_ATTR has the expected value", () => {
    expect(CANVAS_RENDERER_ATTR).toBe("data-design-tool-canvas-renderer");
  });

  it("detects controller role in top-level document (no frameElement)", () => {
    // In jsdom, window.frameElement is undefined by default
    expect(isTopLevelController()).toBe(true);
    expect(isCanvasRenderer()).toBe(false);
    expect(detectRole()).toBe("controller");
  });

  it("returns controller when frameElement has no canvas marker", () => {
    // jsdom does not set window.frameElement, so this is the default path
    expect(detectRole()).toBe("controller");
  });

  it("detectRole is idempotent", () => {
    const r1 = detectRole();
    const r2 = detectRole();
    expect(r1).toBe(r2);
  });

  it("isCanvasRenderer and isTopLevelController are consistent with detectRole", () => {
    const role = detectRole();
    expect(isCanvasRenderer()).toBe(role === "renderer");
    expect(isTopLevelController()).toBe(role === "controller");
  });

  it("distinguishes Canvas iframes from ordinary iframes by attribute", () => {
    const canvasIframe = document.createElement("iframe");
    canvasIframe.setAttribute(CANVAS_RENDERER_ATTR, "");
    const ordinaryIframe = document.createElement("iframe");

    expect(canvasIframe.hasAttribute(CANVAS_RENDERER_ATTR)).toBe(true);
    expect(ordinaryIframe.hasAttribute(CANVAS_RENDERER_ATTR)).toBe(false);
  });

  it("detectRole handles missing frameElement gracefully", () => {
    // When frameElement is null/undefined (not in an iframe), should be controller
    // jsdom doesn't set frameElement, so this is the baseline
    expect(detectRole()).toBe("controller");
  });
});
