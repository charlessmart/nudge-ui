export const CANVAS_RENDERER_ATTR = "data-design-tool-canvas-renderer";

export type DesignToolRole = "controller" | "renderer";

export function detectRole(): DesignToolRole {
  try {
    const frameEl = window.frameElement;
    if (frameEl instanceof HTMLElement && frameEl.hasAttribute(CANVAS_RENDERER_ATTR)) {
      return "renderer";
    }
  } catch {
    // frameElement access may throw if cross-origin
  }
  return "controller";
}

export function isCanvasRenderer(): boolean {
  return detectRole() === "renderer";
}

export function isTopLevelController(): boolean {
  return detectRole() === "controller";
}
