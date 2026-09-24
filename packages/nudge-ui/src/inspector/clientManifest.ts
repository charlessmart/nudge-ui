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
  /** Project-owned, loopback-only agent bridge started by the dev host. */
  readonly agentBridge?: {
    readonly baseUrl: string;
    readonly autoConnect?: boolean;
  };
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
  /** Set by `NUDGE_UI=1`: automated browsers open the editor instead of the plain app. */
  readonly inspectAutomatedBrowsers?: true;
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
      ...(isAgentBridge(value.agentBridge) ? { agentBridge: value.agentBridge } : {}),
      ...(value.document === undefined ? {} : { document: value.document }),
      ...(value.reload === undefined ? {} : { reload: value.reload }),
      ...(value.inspectAutomatedBrowsers === true ? { inspectAutomatedBrowsers: true } : {}),
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
  readonly agentBridge?: unknown;
  readonly inspectAutomatedBrowsers?: unknown;
}

function isAgentBridge(value: unknown): value is NudgeUiClientManifest["agentBridge"] {
  if (value === undefined) return false;
  if (!isRecord(value)) return false;
  const candidate = value as { baseUrl?: unknown; autoConnect?: unknown };
  if (typeof candidate.baseUrl !== "string" || candidate.baseUrl.length === 0) return false;
  return candidate.autoConnect === undefined || typeof candidate.autoConnect === "boolean";
}

interface CandidateDocumentOptions {
  readonly runtimeIdentity?: unknown;
  readonly stylesheetOrder?: unknown;
}

interface CandidateReloadOptions {
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const candidate = value as CandidateDocumentOptions;
  return (candidate.runtimeIdentity === undefined || candidate.runtimeIdentity === "static-html")
    && (candidate.stylesheetOrder === undefined || candidate.stylesheetOrder === "browser");
}

function isReloadOptions(
  // Optional manifest capability is parsed before use.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is NudgeUiClientManifest["reload"] {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const candidate = value as CandidateReloadOptions;
  if (typeof candidate.endpoint !== "string"
    || !candidate.endpoint.startsWith("/__nudge_ui__/")
    || (candidate.strategy !== "refresh-manifest" && candidate.strategy !== "reload-document")) {
    return false;
  }
  return candidate.events === undefined
    || (Array.isArray(candidate.events)
      && candidate.events.length > 0
      && candidate.events.every((event) => typeof event === "string" && event.trim().length > 0));
}

function isRecord(
  // This is the first structural parser for the untrusted JSON value.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is CandidateManifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
