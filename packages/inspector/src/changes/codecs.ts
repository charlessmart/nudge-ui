import type {
  TokenEntry,
} from "@nudge-ui/css/model";
import type {
  ComponentChangeRecord,
  ComponentChangeTarget,
  ComponentInvocationEvidence,
  ComponentPropBaseline,
  ComponentPropValue,
} from "../componentSemantics/types.ts";
import type {
  EditScope,
  RenderedInstanceOverride,
  StyleRuleContext,
  TextBindingEvidence,
  TextContentChangeRecord,
  TextProjectionTarget,
} from "./editModel.ts";
import {
  isRenderedInstanceOverride,
  isStyleRuleContextValue,
  isTextContentChangeValue,
} from "./editModel.ts";
import {
  isComponentChange,
  isTokenChange,
  type ChangeRecord,
  type ElementChangeRecord,
  type TokenChangeRecord,
} from "./types.ts";

/** The token fields that are safe to retain in a durable change record. */
export interface SerializableTokenRef {
  name: string;
  value: string;
  source: string;
  cssValue?: string;
  cssName?: string;
  adapter?: string;
  origin?: TokenEntry["origin"];
}

export interface SerializableElementChange {
  kind?: "element";
  cid: string;
  file: string;
  line: number;
  column?: number;
  selector: string;
  property: string;
  sourceProperty?: string;
  sourceAuthoredValue?: string;
  oldToken: SerializableTokenRef | null;
  newToken: SerializableTokenRef | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
  runtimeEvidence?: NonNullable<ElementChangeRecord["runtimeEvidence"]>;
  scope?: EditScope;
  instanceOverride?: RenderedInstanceOverride;
  state?: NonNullable<ElementChangeRecord["state"]>;
}

export interface SerializableTokenChange {
  kind: "token";
  tokenName: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  rawValue: string;
  oldRawValue: string;
  important?: boolean;
  context: StyleRuleContext;
  contextLabel: string;
  source: { file: string; line: number; component: string };
}

export interface SerializableComponentChange {
  kind: "component-prop";
  target: ComponentChangeTarget;
  property: string;
  before: ComponentPropBaseline;
  after: ComponentPropValue;
  authoredAs: ComponentChangeRecord["authoredAs"];
  scope?: EditScope;
  evidence?: ComponentInvocationEvidence;
}

export interface SerializableTextContentChange {
  kind: "text-content";
  id: string;
  target: TextProjectionTarget;
  source: { file: string; line: number; column: number; component: string };
  selector: string;
  before: string;
  after: string;
  authoredAs: TextContentChangeRecord["authoredAs"];
  scope?: EditScope;
  evidence?: TextBindingEvidence;
}

export type SerializableChange =
  | SerializableElementChange
  | SerializableTokenChange
  | SerializableComponentChange
  | SerializableTextContentChange;

export function isSerializableChange(value: unknown): value is SerializableChange {
  if (!isRecord(value)) return false;
  if (value.kind === "token") return isSerializableTokenChangeValue(value);
  if (value.kind === "component-prop") return isSerializableComponentChangeValue(value);
  if (value.kind === "text-content") return isTextContentChangeValue(value);
  return isSerializableElementChangeValue(value);
}

export function isSerializableElementChangeValue(value: unknown): value is SerializableElementChange {
  if (!isRecord(value)
    || !hasOnlyKeys(value, [
      "kind", "cid", "file", "line", "column", "selector", "property",
      "sourceProperty", "sourceAuthoredValue", "oldToken", "newToken", "rawValue",
      "oldRawValue", "source", "runtimeEvidence", "scope", "instanceOverride", "state",
    ])
    || (value.kind !== undefined && value.kind !== "element")
    || typeof value.cid !== "string"
    || typeof value.file !== "string"
    || !isFiniteNumber(value.line)
    || (value.column !== undefined && !isNonNegativeSafeInteger(value.column))
    || typeof value.selector !== "string"
    || typeof value.property !== "string"
    || !isSourceValue(value.source)
    || !isTokenRefValue(value.oldToken)
    || !isTokenRefValue(value.newToken)
    || (value.sourceProperty !== undefined && typeof value.sourceProperty !== "string")
    || (value.sourceAuthoredValue !== undefined && typeof value.sourceAuthoredValue !== "string")
    || (value.rawValue !== undefined && typeof value.rawValue !== "string")
    || (value.oldRawValue !== undefined && typeof value.oldRawValue !== "string")
    || (value.runtimeEvidence !== undefined && !isRuntimeElementEvidenceValue(value.runtimeEvidence))
    || !isEditScopeValue(value.scope)
    || (value.instanceOverride !== undefined && value.scope !== "rendered-instance")
    || (value.scope === "rendered-instance" && !isRenderedInstanceOverride(value.instanceOverride))
    || (value.state !== undefined && !isElementStateValue(value.state))) {
    return false;
  }
  return true;
}

export function isSerializableTokenChangeValue(value: unknown): value is SerializableTokenChange {
  return isRecord(value)
    && hasOnlyKeys(value, [
      "kind", "tokenName", "file", "line", "selector", "property", "rawValue",
      "oldRawValue", "important", "context", "contextLabel", "source",
    ])
    && value.kind === "token"
    && typeof value.tokenName === "string"
    && typeof value.file === "string"
    && isFiniteNumber(value.line)
    && typeof value.selector === "string"
    && typeof value.property === "string"
    && typeof value.rawValue === "string"
    && typeof value.oldRawValue === "string"
    && (value.important === undefined || typeof value.important === "boolean")
    && isStyleRuleContextValue(value.context)
    && typeof value.contextLabel === "string"
    && isSourceValue(value.source);
}

export function isSerializableComponentChangeValue(value: unknown): value is SerializableComponentChange {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["kind", "target", "property", "before", "after", "authoredAs", "scope", "evidence"])
    || value.kind !== "component-prop"
    || !isComponentTargetValue(value.target)
    || typeof value.property !== "string"
    || !isComponentBaselineValue(value.before)
    || !isComponentPropValue(value.after)
    || !isAuthoredPropKindValue(value.authoredAs)
    || !isEditScopeValue(value.scope)
    || (value.evidence !== undefined && !isComponentInvocationEvidenceValue(value.evidence))) {
    return false;
  }
  const evidence = value.evidence;
  return !isUnsafeRepeatedSourceOverride(value.authoredAs, value.scope, evidence);
}

export function serializeChange(change: ChangeRecord): SerializableChange | null {
  if (isTokenChange(change)) {
    const serialized = serializeTokenChange(change);
    return isSerializableTokenChangeValue(serialized) ? serialized : null;
  }
  if (isComponentChange(change)) {
    if (isRepeatedUnsafeSourceOverride(change)) return null;
    const serialized = serializeComponentChange(change);
    return isSerializableComponentChangeValue(serialized) ? serialized : null;
  }
  if (change.kind === "text-content") {
    const serialized = serializeTextContentChange(change);
    return isTextContentChangeValue(serialized) ? serialized : null;
  }
  const serialized = serializeElementChange(change);
  return serialized && isSerializableElementChangeValue(serialized) ? serialized : null;
}

export function serializeElementChange(change: ElementChangeRecord): SerializableElementChange | null {
  if (change.instanceOverride !== undefined && change.scope !== "rendered-instance") return null;
  if (change.scope === "rendered-instance" && !isRenderedInstanceOverride(change.instanceOverride)) return null;
  return {
    kind: change.kind,
    cid: change.cid,
    file: change.file,
    line: change.line,
    column: change.column,
    selector: change.selector,
    property: change.property,
    sourceProperty: change.sourceProperty,
    sourceAuthoredValue: change.sourceAuthoredValue,
    oldToken: serializeTokenRef(change.oldToken),
    newToken: serializeTokenRef(change.newToken),
    rawValue: change.rawValue,
    oldRawValue: change.oldRawValue,
    source: change.source,
    runtimeEvidence: change.runtimeEvidence ? { ...change.runtimeEvidence } : undefined,
    scope: change.scope === "rendered-instance" ? "rendered-instance" : "source-site",
    instanceOverride: change.scope === "rendered-instance" ? change.instanceOverride : undefined,
    state: change.state,
  };
}

export function serializeTokenChange(change: TokenChangeRecord): SerializableTokenChange {
  const wrappers = change.context?.wrappers;
  return {
    kind: "token",
    tokenName: change.tokenName,
    file: change.file,
    line: change.line,
    selector: change.selector,
    property: change.property,
    rawValue: change.rawValue,
    oldRawValue: change.oldRawValue,
    important: change.important,
    context: wrappers ? { wrappers: wrappers.map((wrapper) => ({ ...wrapper })) } : {},
    contextLabel: change.contextLabel ?? "",
    source: change.source,
  };
}

export function serializeComponentChange(change: ComponentChangeRecord): SerializableComponentChange {
  return {
    kind: "component-prop",
    target: { ...change.target },
    property: change.property,
    before: change.before.kind === "default"
      ? { kind: "default" }
      : { kind: "value", value: change.before.value },
    after: change.after,
    authoredAs: change.authoredAs,
    scope: change.scope,
    evidence: change.evidence ? { ...change.evidence } : undefined,
  };
}

export function serializeTextContentChange(change: TextContentChangeRecord): SerializableTextContentChange {
  return {
    kind: "text-content",
    id: change.id,
    target: {
      sourceSite: { ...change.target.sourceSite },
      occurrence: change.target.occurrence,
      props: change.target.props,
      ariaLabel: change.target.ariaLabel,
      beforeText: change.target.beforeText,
      ...(change.target.textNodePath?.length
        ? { textNodePath: [...change.target.textNodePath] }
        : {}),
    },
    source: { ...change.source },
    selector: change.selector,
    before: change.before,
    after: change.after,
    authoredAs: change.authoredAs,
    scope: change.scope,
    evidence: change.evidence ? { ...change.evidence } : undefined,
  };
}

export function deserializeChange(serialized: SerializableChange): ChangeRecord {
  if (serialized.kind === "token") return deserializeTokenChange(serialized);
  if (serialized.kind === "component-prop") return deserializeComponentChange(serialized);
  if (serialized.kind === "text-content") return deserializeTextContentChange(serialized);
  return deserializeElementChange(serialized);
}

export function deserializeElementChange(serialized: SerializableElementChange): ElementChangeRecord {
  return {
    kind: serialized.kind,
    cid: serialized.cid,
    file: serialized.file,
    line: serialized.line,
    column: serialized.column,
    selector: serialized.selector,
    property: serialized.property,
    sourceProperty: serialized.sourceProperty,
    sourceAuthoredValue: serialized.sourceAuthoredValue,
    oldToken: deserializeTokenRef(serialized.oldToken),
    newToken: deserializeTokenRef(serialized.newToken),
    rawValue: serialized.rawValue,
    oldRawValue: serialized.oldRawValue,
    source: serialized.source,
    runtimeEvidence: serialized.runtimeEvidence ? { ...serialized.runtimeEvidence } : undefined,
    scope: serialized.scope ?? "source-site",
    instanceOverride: serialized.scope === "rendered-instance" ? serialized.instanceOverride : undefined,
    state: serialized.state,
  };
}

export function deserializeTokenChange(serialized: SerializableTokenChange): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: serialized.tokenName,
    file: serialized.file,
    line: serialized.line,
    selector: serialized.selector,
    property: serialized.property,
    rawValue: serialized.rawValue,
    oldRawValue: serialized.oldRawValue,
    important: serialized.important ?? false,
    context: serialized.context ?? {},
    contextLabel: serialized.contextLabel ?? "",
    source: serialized.source,
  };
}

export function deserializeComponentChange(serialized: SerializableComponentChange): ComponentChangeRecord {
  return {
    kind: "component-prop",
    target: { ...serialized.target },
    property: serialized.property,
    before: serialized.before.kind === "default"
      ? { kind: "default" }
      : { kind: "value", value: serialized.before.value },
    after: serialized.after,
    authoredAs: serialized.authoredAs,
    scope: serialized.scope,
    evidence: serialized.evidence ? { ...serialized.evidence } : undefined,
  };
}

export function deserializeTextContentChange(serialized: SerializableTextContentChange): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: serialized.id,
    target: {
      sourceSite: { ...serialized.target.sourceSite },
      occurrence: serialized.target.occurrence,
      props: serialized.target.props,
      ariaLabel: serialized.target.ariaLabel,
      beforeText: serialized.target.beforeText,
      ...(serialized.target.textNodePath?.length
        ? { textNodePath: [...serialized.target.textNodePath] }
        : {}),
    },
    source: { ...serialized.source },
    selector: serialized.selector,
    before: serialized.before,
    after: serialized.after,
    authoredAs: serialized.authoredAs,
    scope: serialized.scope,
    evidence: serialized.evidence ? { ...serialized.evidence } : undefined,
  };
}

function serializeTokenRef(token: TokenEntry | null): SerializableTokenRef | null {
  if (!token) return null;
  return {
    name: token.name,
    value: token.value ?? "",
    source: token.source ?? "",
    cssValue: token.cssValue,
    cssName: token.cssName,
    adapter: token.adapter,
    origin: token.origin,
  };
}

function deserializeTokenRef(serialized: SerializableTokenRef | null): TokenEntry | null {
  if (!serialized) return null;
  return {
    name: serialized.name,
    value: serialized.value,
    source: serialized.source,
    cssValue: serialized.cssValue,
    cssName: serialized.cssName,
    adapter: serialized.adapter,
    origin: serialized.origin,
  };
}

function isUnsafeRepeatedSourceOverride(
  authoredAs: ComponentChangeRecord["authoredAs"],
  scope: EditScope | undefined,
  evidence: unknown,
): boolean {
  return isComponentInvocationEvidenceValue(evidence)
    && evidence.mountedCount > 1
    && (authoredAs === "expression" || authoredAs === "spread")
    && scope !== "rendered-instance";
}

function isRepeatedUnsafeSourceOverride(change: ComponentChangeRecord): boolean {
  return isUnsafeRepeatedSourceOverride(change.authoredAs, change.scope, change.evidence);
}

function isComponentTargetValue(value: unknown): value is ComponentChangeTarget {
  return isRecord(value)
    && hasOnlyKeys(value, ["framework", "componentId", "callsiteId", "componentName", "file", "line", "column"])
    && value.framework === "react"
    && typeof value.componentId === "string"
    && typeof value.callsiteId === "string"
    && typeof value.componentName === "string"
    && typeof value.file === "string"
    && isFiniteNumber(value.line)
    && isFiniteNumber(value.column);
}

function isComponentBaselineValue(value: unknown): value is ComponentPropBaseline {
  if (!isRecord(value)) return false;
  if (value.kind === "default") return hasOnlyKeys(value, ["kind"]);
  return hasOnlyKeys(value, ["kind", "value"])
    && value.kind === "value"
    && isComponentPropValue(value.value);
}

function isComponentInvocationEvidenceValue(value: unknown): value is ComponentInvocationEvidence {
  return isRecord(value)
    && hasOnlyKeys(value, ["occurrence", "props", "ariaLabel", "beforeText", "mountedCount"])
    && isNonNegativeSafeInteger(value.occurrence)
    && (typeof value.props === "string" || value.props === null)
    && (typeof value.ariaLabel === "string" || value.ariaLabel === null)
    && typeof value.beforeText === "string"
    && isNonNegativeSafeInteger(value.mountedCount);
}

function isRuntimeElementEvidenceValue(value: unknown): value is NonNullable<ElementChangeRecord["runtimeEvidence"]> {
  return isRecord(value)
    && hasOnlyKeys(value, ["reason", "tagName", "text", "props", "ariaLabel"])
    && (value.reason === undefined || value.reason === "runtime-created" || value.reason === "unannotated")
    && typeof value.tagName === "string"
    && (typeof value.text === "string" || value.text === null)
    && (typeof value.props === "string" || value.props === null)
    && (typeof value.ariaLabel === "string" || value.ariaLabel === null);
}

function isTokenRefValue(value: unknown): value is SerializableTokenRef | null {
  if (value === null) return true;
  return isRecord(value)
    && hasOnlyKeys(value, ["name", "value", "source", "cssValue", "cssName", "adapter", "origin"])
    && typeof value.name === "string"
    && typeof value.value === "string"
    && typeof value.source === "string"
    && (value.cssValue === undefined || typeof value.cssValue === "string")
    && (value.cssName === undefined || typeof value.cssName === "string")
    && (value.adapter === undefined || typeof value.adapter === "string")
    && (value.origin === undefined
      || value.origin === "project"
      || value.origin === "package"
      || value.origin === "framework"
      || value.origin === "generated"
      || value.origin === "runtime");
}

function isSourceValue(value: unknown): value is { file: string; line: number; component: string } {
  return isRecord(value)
    && hasOnlyKeys(value, ["file", "line", "component"])
    && typeof value.file === "string"
    && isFiniteNumber(value.line)
    && typeof value.component === "string";
}

function isEditScopeValue(value: unknown): value is EditScope | undefined {
  return value === undefined || value === "source-site" || value === "rendered-instance";
}

function isComponentPropValue(value: unknown): value is ComponentPropValue {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

function isAuthoredPropKindValue(value: unknown): value is ComponentChangeRecord["authoredAs"] {
  return value === "literal" || value === "expression" || value === "spread" || value === "default";
}

function isElementStateValue(value: unknown): value is NonNullable<ElementChangeRecord["state"]> {
  return value === "base"
    || value === "hover"
    || value === "active"
    || value === "focus"
    || value === "focus-visible"
    || value === "disabled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
