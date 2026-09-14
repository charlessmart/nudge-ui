import type { TokenContextWrapper } from "../../css/model/index.ts";

export type EditScope = "source-site" | "rendered-instance";

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

/** The browser-independent CSS context retained on a token change. */
export interface StyleRuleContext {
  wrappers?: TokenContextWrapper[];
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

/** Validates the serializable context carried by a token change. */
export function isStyleRuleContextValue(value: unknown): value is StyleRuleContext {
  if (!isRecord(value) || !hasOnlyKeys(value, ["wrappers"])) return false;
  const wrappers = value.wrappers;
  return wrappers === undefined || (Array.isArray(wrappers) && wrappers.every((wrapper) => {
    if (!isRecord(wrapper) || !hasOnlyKeys(wrapper, ["kind", "params"])) return false;
    return (wrapper.kind === "media"
      || wrapper.kind === "supports"
      || wrapper.kind === "scope"
      || wrapper.kind === "layer")
      && typeof wrapper.params === "string";
  }));
}

/** A source site shared by text and rendered-instance evidence. */
export type TextProjectionSourceSite = SourceSiteRef;

export interface TextProjectionTarget {
  sourceSite: TextProjectionSourceSite;
  occurrence: number;
  props: string | null;
  ariaLabel: string | null;
  beforeText: string;
  /** Document-local evidence for a text node inside safe mixed markup. */
  textNodePath?: readonly number[];
}

export type TextProjectionScope = EditScope;

/** Bounded semantic evidence retained alongside an instance text projection. */
export interface TextBindingEvidence {
  callsiteId: string;
  componentName: string;
  property: string;
  mountedCount: number;
}

export interface TextContentChangeRecord {
  kind: "text-content";
  property?: undefined;
  id: string;
  target: TextProjectionTarget;
  source: { file: string; line: number; column: number; component: string };
  selector: string;
  before: string;
  after: string;
  authoredAs: "literal" | "expression" | "unknown";
  scope?: TextProjectionScope;
  evidence?: TextBindingEvidence;
}

export function isTextProjectionTargetValue(value: unknown): value is TextProjectionTarget {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["sourceSite", "occurrence", "props", "ariaLabel", "beforeText", "textNodePath"])) {
    return false;
  }
  const occurrence = value.occurrence;
  const props = value.props;
  const ariaLabel = value.ariaLabel;
  const beforeText = value.beforeText;
  const textNodePath = value.textNodePath;
  if (!isNonNegativeSafeInteger(occurrence)
    || (typeof props !== "string" && props !== null)
    || (typeof ariaLabel !== "string" && ariaLabel !== null)
    || typeof beforeText !== "string"
    || (textNodePath !== undefined
      && (!Array.isArray(textNodePath)
        || textNodePath.length === 0
        || !textNodePath.every(isNonNegativeSafeInteger)))) {
    return false;
  }
  const source = value.sourceSite;
  return isRecord(source)
    && hasOnlyKeys(source, ["cid", "src"])
    && typeof source.cid === "string"
    && source.cid.length > 0
    && typeof source.src === "string"
    && source.src.length > 0;
}

export function isTextContentChangeValue(value: unknown): value is TextContentChangeRecord {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["kind", "id", "target", "source", "selector", "before", "after", "authoredAs", "scope", "evidence"])) {
    return false;
  }
  if (value.kind !== "text-content"
    || typeof value.id !== "string" || value.id.length === 0
    || typeof value.selector !== "string" || value.selector.length === 0
    || typeof value.before !== "string"
    || typeof value.after !== "string"
    || (value.authoredAs !== "literal" && value.authoredAs !== "expression" && value.authoredAs !== "unknown")) {
    return false;
  }

  const source = value.source;
  if (!isRecord(source)
    || !hasOnlyKeys(source, ["file", "line", "column", "component"])
    || typeof source.file !== "string" || source.file.length === 0
    || !isNonNegativeSafeInteger(source.line)
    || !isNonNegativeSafeInteger(source.column)
    || typeof source.component !== "string" || source.component.length === 0) {
    return false;
  }

  if (value.scope !== undefined
    && value.scope !== "source-site"
    && value.scope !== "rendered-instance") return false;

  if (value.evidence !== undefined) {
    const evidence = value.evidence;
    if (!isRecord(evidence)
      || !hasOnlyKeys(evidence, ["callsiteId", "componentName", "property", "mountedCount"])
      || typeof evidence.callsiteId !== "string" || evidence.callsiteId.length === 0
      || typeof evidence.componentName !== "string" || evidence.componentName.length === 0
      || typeof evidence.property !== "string" || evidence.property.length === 0
      || !isNonNegativeSafeInteger(evidence.mountedCount)) return false;
  }

  return isTextProjectionTargetValue(value.target)
    && value.target.beforeText === value.before;
}

export function isTextContentChangeListValue(value: unknown): value is TextContentChangeRecord[] {
  if (!Array.isArray(value) || !value.every(isTextContentChangeValue)) return false;
  return new Set(value.map((change) => change.id)).size === value.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
