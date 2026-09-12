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
  locator: {
    kind: "evidence";
    occurrence: number;
    props: string | null;
    text: string | null;
    /** An accessible name can distinguish icon-only repeated controls. */
    ariaLabel?: string | null;
  };
}

export interface RenderedInstanceOverride {
  id: string;
  target: RenderedInstanceRef;
}

export function isRenderedInstanceRef(value: unknown): value is RenderedInstanceRef {
  if (!isRecord(value) || !hasOnlyKeys(value, ["sourceSite", "locator"])) return false;
  const source = value.sourceSite;
  const locator = value.locator;
  if (!isRecord(source)
    || !hasOnlyKeys(source, ["cid", "src"])
    || typeof source.cid !== "string"
    || typeof source.src !== "string"
    || !isRecord(locator)
    || !hasOnlyKeys(locator, ["kind", "occurrence", "props", "text", "ariaLabel"])) return false;
  return locator.kind === "evidence"
    && Number.isSafeInteger(locator.occurrence) && (locator.occurrence as number) >= 0
    && (typeof locator.props === "string" || locator.props === null)
    && (typeof locator.text === "string" || locator.text === null)
    && (locator.ariaLabel === undefined || typeof locator.ariaLabel === "string" || locator.ariaLabel === null);
}

export function isRenderedInstanceOverride(value: unknown): value is RenderedInstanceOverride {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "target"])
    && typeof value.id === "string"
    && isRenderedInstanceRef(value.target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
