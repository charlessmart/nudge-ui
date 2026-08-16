import { isRenderedInstanceRef } from "./renderedInstance.ts";
import type {
  StructuralChange,
  StructuralDelete,
  StructuralMove,
  StructuralProjectionReport,
} from "./structuralProjection.ts";

export function isStructuralProjectionReport(value: unknown): value is StructuralProjectionReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return hasOnlyKeys(candidate, ["changeId", "status"])
    && typeof candidate.changeId === "string"
    && (candidate.status === "applied" || candidate.status === "missing"
      || candidate.status === "ambiguous" || candidate.status === "overridden");
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
  if (!hasOnlyKeys(candidate, ["id", "kind", "target", "destination", "presentation"]) || candidate.kind !== "move"
    || typeof candidate.id !== "string" || !isStrictRenderedInstanceRef(candidate.target)) return false;
  if (!candidate.destination || typeof candidate.destination !== "object"
    || !candidate.presentation || typeof candidate.presentation !== "object") return false;
  const destination = candidate.destination as Record<string, unknown>;
  const presentation = candidate.presentation as Record<string, unknown>;
  return hasOnlyKeys(destination, ["parent", "before"])
    && isStrictRenderedInstanceRef(destination.parent)
    && (destination.before === null || isStrictRenderedInstanceRef(destination.before))
    && hasOnlyKeys(presentation, ["parentTag", "fromIndex", "toIndex"])
    && typeof presentation.parentTag === "string"
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
