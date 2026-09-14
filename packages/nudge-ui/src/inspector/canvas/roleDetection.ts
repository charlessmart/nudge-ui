export const CANVAS_RENDERER_ATTR = "data-nudge-ui-canvas-renderer";

export type NudgeUiRole = "controller" | "renderer";

export function detectRole(): NudgeUiRole {
  try {
    const frameEl = window.frameElement;
    if (!frameEl) return "controller";
    if (frameEl.hasAttribute?.(CANVAS_RENDERER_ATTR)) {
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
