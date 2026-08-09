import { escapeAttrValue } from "./cssEscapes.ts";
import { sourceSiteSelector } from "./sourceSite.ts";

/** A JSX instrumentation site. This is stable across documents. */
export interface SourceSiteRef {
  cid: string;
  src: string;
}

/**
 * Serializable identity for one rendered output. It deliberately contains no
 * DOM reference or generated node id: each document resolves it independently.
 */
export interface RenderedInstanceRef {
  sourceSite: SourceSiteRef;
  locator:
    | { kind: "application-key"; attribute: string; value: string }
    | { kind: "evidence"; occurrence: number; props: string | null; text: string | null };
}

export interface RenderedInstanceOverride {
  id: string;
  target: RenderedInstanceRef;
}

export type ResolutionResult =
  | { status: "resolved"; element: HTMLElement }
  | { status: "missing" }
  | { status: "ambiguous" };

export interface DocumentProjectionReport {
  overrideId: string;
  status: ResolutionResult["status"];
}

const PROJECTION_ATTR = "data-dt-projection-instance";
const APPLICATION_KEY_ATTRIBUTES = ["data-dt-instance-key"];

let nextOverrideId = 1;
let transientTargets = new WeakMap<HTMLElement, RenderedInstanceOverride>();
let canonicalOverrides = new Map<string, RenderedInstanceOverride>();
let reportsByDocument = new WeakMap<Document, DocumentProjectionReport[]>();

function normalizedText(el: HTMLElement): string | null {
  return el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

function candidates(doc: Document, sourceSite: SourceSiteRef): HTMLElement[] {
  const selector = sourceSiteSelector(sourceSite.cid, sourceSite.src);
  if (!selector) return [];
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

function applicationKey(el: HTMLElement): { attribute: string; value: string } | null {
  for (const attribute of APPLICATION_KEY_ATTRIBUTES) {
    const value = el.getAttribute(attribute);
    if (value) return { attribute, value };
  }
  return null;
}

/** Captures conservative, serializable identity at the moment of the action. */
export function captureRenderedInstance(el: HTMLElement): RenderedInstanceRef | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const sourceSite = { cid, src };
  const sourceCandidates = candidates(el.ownerDocument, sourceSite);
  const occurrence = sourceCandidates.indexOf(el);
  if (!cid || occurrence < 0) return null;
  const key = applicationKey(el);
  if (key) return { sourceSite, locator: { kind: "application-key", ...key } };
  return {
    sourceSite,
    locator: {
      kind: "evidence",
      occurrence,
      props: el.getAttribute("data-cprops"),
      text: normalizedText(el),
    },
  };
}

/**
 * Resolves exactly one element, or declines to apply. Evidence and the stored
 * occurrence must still agree, so a re-sorted list cannot receive an edit for
 * a different item just because its ordinal happened to remain valid.
 */
export function resolveRenderedInstance(doc: Document, ref: RenderedInstanceRef): ResolutionResult {
  const sourceCandidates = candidates(doc, ref.sourceSite);
  if (ref.locator.kind === "application-key") {
    const locator = ref.locator;
    const matches = sourceCandidates.filter((el) =>
      el.getAttribute(locator.attribute) === locator.value);
    return matches.length === 1
      ? { status: "resolved", element: matches[0]! }
      : matches.length === 0 ? { status: "missing" } : { status: "ambiguous" };
  }

  const { occurrence, props, text } = ref.locator;
  const candidate = sourceCandidates[occurrence];
  if (!candidate) return { status: "missing" };
  // An ordinal alone is not an identity for a repeated source site.
  if (sourceCandidates.length > 1 && props === null && text === null) return { status: "ambiguous" };
  const matchingEvidence = sourceCandidates.filter((element) =>
    element.getAttribute("data-cprops") === props && normalizedText(element) === text);
  if (matchingEvidence.length === 0 || !matchingEvidence.includes(candidate)) {
    return { status: "missing" };
  }
  // Occurrence alone is never enough to choose between two identical rendered
  // outputs. This is particularly important for structural anchors: applying
  // one move to an arbitrary identical parent would reorder the wrong group.
  if (matchingEvidence.length > 1) return { status: "ambiguous" };
  return { status: "resolved", element: candidate };
}

export function createRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const target = captureRenderedInstance(el);
  if (!target) return null;
  const override: RenderedInstanceOverride = {
    id: `override-${crypto.randomUUID?.() ?? nextOverrideId++}`,
    target,
  };
  transientTargets.set(el, override);
  return override;
}

/** Returns an active transient target or the canonical target projected here. */
export function getRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const transient = transientTargets.get(el);
  if (transient) return transient;
  const id = el.getAttribute(PROJECTION_ATTR);
  return id ? canonicalOverrides.get(id) ?? null : null;
}

export function clearRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const override = getRenderedInstanceOverride(el);
  transientTargets.delete(el);
  return override;
}

export function instanceSelector(override: RenderedInstanceOverride): string | null {
  const source = sourceSiteSelector(override.target.sourceSite.cid, override.target.sourceSite.src);
  return source ? `${source}[${PROJECTION_ATTR}="${escapeAttrValue(override.id)}"]` : null;
}

/** Extracts the distinct canonical targets which renderers must resolve. */
export function collectRenderedInstanceOverrides(
  changes: ReadonlyArray<unknown>,
): RenderedInstanceOverride[] {
  const result = new Map<string, RenderedInstanceOverride>();
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const candidate = change as { scope?: unknown; instanceOverride?: unknown };
    if (candidate.scope === "rendered-instance" && isRenderedInstanceOverride(candidate.instanceOverride)) {
      result.set(candidate.instanceOverride.id, candidate.instanceOverride);
    }
  }
  return [...result.values()];
}

/**
 * The document-projection adapter. Clearing then resolving makes projection a
 * pure function of controller-owned records; no observer continuously fights
 * framework reconciliation.
 */
export function applyRenderedInstanceProjection(
  doc: Document,
  overrides: ReadonlyArray<RenderedInstanceOverride>,
): DocumentProjectionReport[] {
  for (const marker of Array.from(doc.querySelectorAll<HTMLElement>(`[${PROJECTION_ATTR}]`))) {
    marker.removeAttribute(PROJECTION_ATTR);
  }
  canonicalOverrides = new Map(overrides.map((override) => [override.id, override]));
  const reports: DocumentProjectionReport[] = [];
  for (const override of overrides) {
    const resolved = resolveRenderedInstance(doc, override.target);
    reports.push({ overrideId: override.id, status: resolved.status });
    if (resolved.status === "resolved") {
      resolved.element.setAttribute(PROJECTION_ATTR, override.id);
    }
  }
  reportsByDocument.set(doc, reports);
  return reports;
}

export function getRenderedInstanceProjectionReports(doc: Document): readonly DocumentProjectionReport[] {
  return reportsByDocument.get(doc) ?? [];
}

export function isRenderedInstanceRef(value: unknown): value is RenderedInstanceRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  const source = ref.sourceSite as Record<string, unknown> | undefined;
  const locator = ref.locator as Record<string, unknown> | undefined;
  if (!source || typeof source.cid !== "string" || typeof source.src !== "string" || !locator) return false;
  if (locator.kind === "application-key") {
    return typeof locator.attribute === "string" && typeof locator.value === "string";
  }
  return locator.kind === "evidence"
    && Number.isSafeInteger(locator.occurrence) && (locator.occurrence as number) >= 0
    && (typeof locator.props === "string" || locator.props === null)
    && (typeof locator.text === "string" || locator.text === null);
}

export function isRenderedInstanceOverride(value: unknown): value is RenderedInstanceOverride {
  return Boolean(value && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && isRenderedInstanceRef((value as { target?: unknown }).target));
}

/** Test hook for module-local controller state. */
export function resetRenderedInstanceState(): void {
  nextOverrideId = 1;
  transientTargets = new WeakMap();
  canonicalOverrides = new Map();
  reportsByDocument = new WeakMap();
}
