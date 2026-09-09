import { isRenderedInstanceRef } from "./renderedInstance.ts";
import type {
  StructuralChange,
  StructuralDelete,
  StructuralMove,
  StructuralProjectionReason,
  StructuralProjectionReport,
} from "../changes/structuralTypes.ts";

export function isStructuralProjectionReport(value: unknown): value is StructuralProjectionReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!hasOnlyKeys(candidate, ["changeId", "status", "reason"])
    || typeof candidate.changeId !== "string") return false;
  const status = candidate.status;
  if (status !== "applied" && status !== "missing" && status !== "ambiguous" && status !== "overridden") return false;
  const reason = candidate.reason;
  if (reason !== undefined && !isStructuralProjectionReason(reason)) return false;
  return status === "applied" ? reason === undefined : reason !== undefined;
}

export function isStructuralDelete(value: unknown): value is StructuralDelete {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!hasOnlyKeys(candidate, ["id", "kind", "target"])) return false;
  return candidate.kind === "delete"
    && typeof candidate.id === "string"
    && isStrictRenderedInstanceRef(candidate.target);
}

export function isStructuralMove(value: unknown): value is StructuralMove {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!hasOnlyKeys(candidate, ["id", "kind", "target", "source", "destination", "presentation"]) || candidate.kind !== "move"
    || typeof candidate.id !== "string" || !isStrictRenderedInstanceRef(candidate.target)) return false;
  if (!candidate.source || typeof candidate.source !== "object"
    || !candidate.destination || typeof candidate.destination !== "object"
    || !candidate.presentation || typeof candidate.presentation !== "object") return false;
  const source = candidate.source as Record<string, unknown>;
  const destination = candidate.destination as Record<string, unknown>;
  const presentation = candidate.presentation as Record<string, unknown>;
  return hasOnlyKeys(source, ["parent"])
    && isStrictRenderedInstanceRef(source.parent)
    && hasOnlyKeys(destination, ["parent", "before"])
    && isStrictRenderedInstanceRef(destination.parent)
    && (destination.before === null || isStrictRenderedInstanceRef(destination.before))
    && hasOnlyKeys(presentation, ["sourceParentTag", "destinationParentTag", "fromIndex", "toIndex"])
    && typeof presentation.sourceParentTag === "string"
    && typeof presentation.destinationParentTag === "string"
    && Number.isSafeInteger(presentation.fromIndex) && (presentation.fromIndex as number) >= 0
    && Number.isSafeInteger(presentation.toIndex) && (presentation.toIndex as number) >= 0;
}

export function isStructuralChange(value: unknown): value is StructuralChange {
  return isStructuralDelete(value) || isStructuralMove(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStrictRenderedInstanceRef(value: unknown): boolean {
  if (!isRenderedInstanceRef(value)) return false;
  const ref = value as unknown as Record<string, unknown>;
  const source = ref.sourceSite as Record<string, unknown>;
  const locator = ref.locator as Record<string, unknown>;
  if (!hasOnlyKeys(ref, ["sourceSite", "locator"]) || !hasOnlyKeys(source, ["cid", "src"])) return false;
  return locator.kind === "evidence"
    && hasOnlyKeys(locator, ["kind", "occurrence", "props", "text", "ariaLabel"]);
}

function isStructuralProjectionReason(value: unknown): value is StructuralProjectionReason {
  return value === "target"
    || value === "source-parent"
    || value === "destination-parent"
    || value === "anchor"
    || value === "illegal-destination"
    || value === "react-override";
}
