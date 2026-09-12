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
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  const source = ref.sourceSite as Record<string, unknown> | undefined;
  const locator = ref.locator as Record<string, unknown> | undefined;
  if (!source || typeof source.cid !== "string" || typeof source.src !== "string" || !locator) return false;
  return locator.kind === "evidence"
    && Number.isSafeInteger(locator.occurrence) && (locator.occurrence as number) >= 0
    && (typeof locator.props === "string" || locator.props === null)
    && (typeof locator.text === "string" || locator.text === null)
    && (locator.ariaLabel === undefined || typeof locator.ariaLabel === "string" || locator.ariaLabel === null);
}

export function isRenderedInstanceOverride(value: unknown): value is RenderedInstanceOverride {
  return Boolean(value && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && isRenderedInstanceRef((value as { target?: unknown }).target));
}
