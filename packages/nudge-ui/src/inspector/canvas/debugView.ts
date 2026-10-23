// Shared by the controller store and renderer frames; keep free of React.

/** Debug views a renderer applies to the application document. */
export interface DebugViewState {
  readonly outlines: boolean;
  readonly xray: boolean;
  /** Labels every element that animates on its own. */
  readonly animations: boolean;
}

export const DEBUG_VIEW_OFF: DebugViewState = { outlines: false, xray: false, animations: false };

/** Strict JSON-only check for debug view state received over postMessage. */
export function isDebugViewState(value: unknown): value is DebugViewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.outlines === "boolean"
    && typeof candidate.xray === "boolean"
    && typeof candidate.animations === "boolean";
}
