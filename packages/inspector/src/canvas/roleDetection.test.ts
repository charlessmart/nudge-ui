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





  it("isCanvasRenderer and isTopLevelController are consistent with detectRole", () => {
    const role = detectRole();
    expect(isCanvasRenderer()).toBe(role === "renderer");
    expect(isTopLevelController()).toBe(role === "controller");
  });




});
