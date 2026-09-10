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
  readonly revision: number;
  readonly runtime: NudgeUiRuntimeConfig;
  /** Optional document preparation requested by the host Adapter. */
  readonly document?: {
    readonly runtimeIdentity?: "static-html";
    readonly stylesheetOrder?: "browser";
  };
  /** Optional development reload transport owned by the host Adapter. */
  readonly reload?: {
    readonly endpoint: string;
    readonly strategy: "refresh-manifest" | "reload-document";
    readonly events?: readonly string[];
  };
}

/** Parses and normalizes an external manifest before it replaces inspector state. */
export function parseNudgeUiClientManifest(
  // JSON is untrusted at this I/O boundary and is narrowed below.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): NudgeUiClientManifest | null {
  if (!isRecord(value)
    || value.version !== NUDGE_UI_CLIENT_MANIFEST_VERSION
    || typeof value.revision !== "number"
    || !Number.isInteger(value.revision)
    || value.revision < 0
    || !isDocumentOptions(value.document)
    || !isReloadOptions(value.reload)) return null;
  try {
    return {
      version: NUDGE_UI_CLIENT_MANIFEST_VERSION,
      revision: value.revision,
      runtime: normalizeNudgeUiRuntimeConfig(value.runtime),
      ...(value.document === undefined ? {} : { document: value.document }),
      ...(value.reload === undefined ? {} : { reload: value.reload }),
    };
  } catch {
    return null;
  }
}

interface CandidateManifest {
  readonly version?: unknown;
  readonly revision?: unknown;
  readonly runtime?: unknown;
  readonly document?: unknown;
  readonly reload?: unknown;
  readonly runtimeIdentity?: unknown;
  readonly stylesheetOrder?: unknown;
  readonly endpoint?: unknown;
  readonly strategy?: unknown;
  readonly events?: unknown;
}

function isDocumentOptions(
  // Optional manifest capability is parsed before use.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is NudgeUiClientManifest["document"] {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (value.runtimeIdentity === undefined || value.runtimeIdentity === "static-html")
    && (value.stylesheetOrder === undefined || value.stylesheetOrder === "browser");
}

function isReloadOptions(
  // Optional manifest capability is parsed before use.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is NudgeUiClientManifest["reload"] {
  if (value === undefined) return true;
  if (!isRecord(value)
    || typeof value.endpoint !== "string"
    || !value.endpoint.startsWith("/__nudge_ui__/")
    || (value.strategy !== "refresh-manifest" && value.strategy !== "reload-document")) {
    return false;
  }
  return value.events === undefined
    || (Array.isArray(value.events) && value.events.every((event) => typeof event === "string"));
}

function isRecord(
  // This is the first structural parser for the untrusted JSON value.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is CandidateManifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
