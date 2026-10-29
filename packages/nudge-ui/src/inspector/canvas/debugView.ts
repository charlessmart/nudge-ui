// Shared by the controller store and renderer frames; keep free of React.

/** Debug views a renderer applies to the application document. */
export interface DebugViewState {
  readonly outlines: boolean;
  readonly xray: boolean;
  /** Fills each visible element's margin and padding, and the gaps between flex and grid items. */
  readonly spacing: boolean;
  /** How fast every animation on the page runs; 1 leaves them alone. */
  readonly animationSpeed: number;
}

export const DEBUG_VIEW_OFF: DebugViewState = { outlines: false, xray: false, spacing: false, animationSpeed: 1 };

/** Strict JSON-only check for debug view state received over postMessage. */
export function isDebugViewState(value: unknown): value is DebugViewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.outlines === "boolean"
    && typeof candidate.xray === "boolean"
    && typeof candidate.spacing === "boolean"
    && typeof candidate.animationSpeed === "number"
    && candidate.animationSpeed > 0
    && candidate.animationSpeed <= 1;
}
