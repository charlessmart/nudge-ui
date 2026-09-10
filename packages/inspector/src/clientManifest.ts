import {
  normalizeNudgeUiRuntimeConfig,
  type NudgeUiRuntimeConfig,
} from "./runtime/runtimeConfig.ts";

export type { NudgeUiRuntimeConfig } from "./runtime/runtimeConfig.ts";
export { detectStylingSystem } from "./runtime/runtimeConfig.ts";

/** Version of the host-to-inspector runtime manifest Interface. */
export const NUDGE_UI_CLIENT_MANIFEST_VERSION = 1;

/** Runtime document consumed by the self-contained inspector client. */
export interface NudgeUiClientManifest {
  readonly version: typeof NUDGE_UI_CLIENT_MANIFEST_VERSION;
  readonly runtime: NudgeUiRuntimeConfig;
}

/** Parses and normalizes an external manifest before it replaces inspector state. */
export function parseNudgeUiClientManifest(
  // JSON is untrusted at this I/O boundary and is narrowed below.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): NudgeUiClientManifest | null {
  if (!isRecord(value)
    || value.version !== NUDGE_UI_CLIENT_MANIFEST_VERSION) return null;
  try {
    return {
      version: NUDGE_UI_CLIENT_MANIFEST_VERSION,
      runtime: normalizeNudgeUiRuntimeConfig(value.runtime),
    };
  } catch {
    return null;
  }
}

/** Returns whether a value is a valid client manifest. */
export function isNudgeUiClientManifest(
  // JSON is untrusted at this I/O boundary and is parsed by the function below.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is NudgeUiClientManifest {
  return parseNudgeUiClientManifest(value) !== null;
}

interface CandidateManifest {
  readonly version?: unknown;
  readonly runtime?: unknown;
}

function isRecord(
  // This is the first structural parser for the untrusted JSON value.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is CandidateManifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
