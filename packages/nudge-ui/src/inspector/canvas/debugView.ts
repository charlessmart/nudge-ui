// Shared by the controller store and renderer frames; keep free of React.

/** Debug views a renderer applies to the application document. */
export interface DebugViewState {
  /** Animation slow-down factor; 1 plays at normal speed. */
  readonly timeScale: number;
  readonly outlines: boolean;
  readonly xray: boolean;
}

export const DEBUG_TIME_SCALE_MAX = 10;
export const DEBUG_VIEW_OFF: DebugViewState = { timeScale: 1, outlines: false, xray: false };

export function clampDebugTimeScale(value: number): number {
  return Number.isFinite(value) ? Math.min(DEBUG_TIME_SCALE_MAX, Math.max(1, value)) : 1;
}

/** Strict JSON-only check for debug view state received over postMessage. */
export function isDebugViewState(value: unknown): value is DebugViewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.timeScale === "number"
    && clampDebugTimeScale(candidate.timeScale) === candidate.timeScale
    && typeof candidate.outlines === "boolean"
    && typeof candidate.xray === "boolean";
}
