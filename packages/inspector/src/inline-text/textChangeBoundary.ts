/**
 * Neutral JSON boundary for rendered-text intent. This module deliberately
 * has no dependency on canonical history or document projection code.
 */

import type { EditScope } from "../changes/editModel.ts";

export interface TextProjectionSourceSite {
  cid: string;
  src: string;
}

export interface TextProjectionTarget {
  sourceSite: TextProjectionSourceSite;
  occurrence: number;
  props: string | null;
  ariaLabel: string | null;
  beforeText: string;
  /**
   * Optional child-node path for a text node inside safe mixed markup. The
   * path is document-local evidence only; source-site and text remain the
   * durable identity. Direct leaf text keeps this field absent for backwards
   * compatible session records.
   */
  textNodePath?: readonly number[];
}

export type TextProjectionScope = EditScope;

/** Bounded semantic evidence retained alongside an instance projection. */
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
  /** New records explicitly state that this is one output or a source site. */
  scope?: TextProjectionScope;
  /** Present when semantic matching led to this rendered-text fallback. */
  evidence?: TextBindingEvidence;
}

/** Raw parsed JSON object at this module's persistence/message boundary. */
interface TextBoundaryObject {
  readonly after?: unknown;
  readonly ariaLabel?: unknown;
  readonly authoredAs?: unknown;
  readonly before?: unknown;
  readonly beforeText?: unknown;
  readonly callsiteId?: unknown;
  readonly cid?: unknown;
  readonly column?: unknown;
  readonly component?: unknown;
  readonly componentName?: unknown;
  readonly evidence?: unknown;
  readonly file?: unknown;
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly line?: unknown;
  readonly mountedCount?: unknown;
  readonly occurrence?: unknown;
  readonly property?: unknown;
  readonly props?: unknown;
  readonly scope?: unknown;
  readonly selector?: unknown;
  readonly source?: unknown;
  readonly sourceSite?: unknown;
  readonly src?: unknown;
  readonly textNodePath?: unknown;
  readonly target?: unknown;
}

type TextBoundaryKey = keyof TextBoundaryObject;

function isObject(value: unknown): value is TextBoundaryObject {
  return typeof value === "object" && value !== null;
}

function ownValue(value: TextBoundaryObject, key: TextBoundaryKey): unknown {
  switch (key) {
    case "after": return value.after;
    case "ariaLabel": return value.ariaLabel;
    case "authoredAs": return value.authoredAs;
    case "before": return value.before;
    case "beforeText": return value.beforeText;
    case "callsiteId": return value.callsiteId;
    case "cid": return value.cid;
    case "column": return value.column;
    case "component": return value.component;
    case "componentName": return value.componentName;
    case "evidence": return value.evidence;
    case "file": return value.file;
    case "id": return value.id;
    case "kind": return value.kind;
    case "line": return value.line;
    case "mountedCount": return value.mountedCount;
    case "occurrence": return value.occurrence;
    case "property": return value.property;
    case "props": return value.props;
    case "scope": return value.scope;
    case "selector": return value.selector;
    case "source": return value.source;
    case "sourceSite": return value.sourceSite;
    case "src": return value.src;
    case "textNodePath": return value.textNodePath;
    case "target": return value.target;
  }
}

function hasOnlyKeys(value: TextBoundaryObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isTextProjectionTargetValue(value: unknown): value is TextProjectionTarget {
  if (!isObject(value)
    || !hasOnlyKeys(value, ["sourceSite", "occurrence", "props", "ariaLabel", "beforeText", "textNodePath"])) return false;
  const occurrence = ownValue(value, "occurrence");
  const props = ownValue(value, "props");
  const ariaLabel = ownValue(value, "ariaLabel");
  const beforeText = ownValue(value, "beforeText");
  const textNodePath = ownValue(value, "textNodePath");
  if (!isNonNegativeSafeInteger(occurrence)
    || (typeof props !== "string" && props !== null)
    || (typeof ariaLabel !== "string" && ariaLabel !== null)
    || typeof beforeText !== "string"
    || (textNodePath !== undefined
      && (!Array.isArray(textNodePath)
        || textNodePath.length === 0
        || !textNodePath.every(isNonNegativeSafeInteger)))) return false;
  const source = ownValue(value, "sourceSite");
  if (!isObject(source) || !hasOnlyKeys(source, ["cid", "src"])) return false;
  const cid = ownValue(source, "cid");
  const src = ownValue(source, "src");
  return typeof cid === "string" && cid.length > 0
    && typeof src === "string" && src.length > 0;
}

export function isTextContentChangeValue(value: unknown): value is TextContentChangeRecord {
  if (!isObject(value)
    || !hasOnlyKeys(value, ["kind", "id", "target", "source", "selector", "before", "after", "authoredAs", "scope", "evidence"])) return false;
  const kind = ownValue(value, "kind");
  const id = ownValue(value, "id");
  const selector = ownValue(value, "selector");
  const before = ownValue(value, "before");
  const after = ownValue(value, "after");
  const authoredAs = ownValue(value, "authoredAs");
  if (kind !== "text-content"
    || typeof id !== "string" || id.length === 0
    || typeof selector !== "string" || selector.length === 0
    || typeof before !== "string"
    || typeof after !== "string"
    || (authoredAs !== "literal" && authoredAs !== "expression" && authoredAs !== "unknown")) return false;

  const source = ownValue(value, "source");
  if (!isObject(source) || !hasOnlyKeys(source, ["file", "line", "column", "component"])) return false;
  const file = ownValue(source, "file");
  const line = ownValue(source, "line");
  const column = ownValue(source, "column");
  const component = ownValue(source, "component");
  if (typeof file !== "string" || file.length === 0
    || !isNonNegativeSafeInteger(line)
    || !isNonNegativeSafeInteger(column)
    || typeof component !== "string" || component.length === 0) return false;

  const scope = ownValue(value, "scope");
  if (scope !== undefined && scope !== "source-site" && scope !== "rendered-instance") return false;
  const evidence = ownValue(value, "evidence");
  if (evidence !== undefined) {
    if (!isObject(evidence) || !hasOnlyKeys(evidence, ["callsiteId", "componentName", "property", "mountedCount"])) return false;
    const callsiteId = ownValue(evidence, "callsiteId");
    const componentName = ownValue(evidence, "componentName");
    const property = ownValue(evidence, "property");
    const mountedCount = ownValue(evidence, "mountedCount");
    if (typeof callsiteId !== "string" || callsiteId.length === 0
      || typeof componentName !== "string" || componentName.length === 0
      || typeof property !== "string" || property.length === 0
      || !isNonNegativeSafeInteger(mountedCount)) return false;
  }
  const target = ownValue(value, "target");
  return isTextProjectionTargetValue(target)
    && target.beforeText === before;
}

export function isTextContentChangeListValue(value: unknown): value is TextContentChangeRecord[] {
  if (!Array.isArray(value) || !value.every(isTextContentChangeValue)) return false;
  return new Set(value.map((change) => change.id)).size === value.length;
}
