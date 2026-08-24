import type {
  ComponentChangeRecord,
  ComponentOverride,
  ComponentPropBaseline,
  ComponentPropContract,
  ComponentPropValue,
  ComponentChangeScope,
  ComponentInvocationEvidence,
  EditableComponentTarget,
} from "./types.ts";
import { componentPropBaseline } from "./boundaries.ts";

export function formatComponentPropValue(value: ComponentPropValue): string {
  return String(value);
}

export function formatComponentPropBaseline(
  baseline: ComponentPropBaseline,
): string {
  return baseline.kind === "default"
    ? "(default)"
    : formatComponentPropValue(baseline.value);
}

export function createComponentPropChange(
  target: EditableComponentTarget,
  prop: ComponentPropContract,
  after: ComponentPropValue,
  options: {
    scope?: ComponentChangeScope;
    evidence?: ComponentInvocationEvidence;
  } = {},
): ComponentChangeRecord {
  const authoredAs = target.meta.authoredProps[prop.name]
    ?? (target.meta.authoredProps["..."] ? "spread" : "default");
  return {
    kind: "component-prop",
    target: {
      framework: target.framework,
      componentId: target.contract.componentId,
      callsiteId: target.meta.callsiteId,
      componentName: target.meta.componentName,
      file: target.meta.file,
      line: target.meta.line,
      column: target.meta.column,
    },
    property: prop.name,
    before: componentPropBaseline(target.props[prop.name]),
    after,
    authoredAs,
    scope: options.scope ?? "source-site",
    evidence: options.evidence,
  };
}

export function componentChangeToOverride(
  change: ComponentChangeRecord,
): ComponentOverride | null {
  if (change.authoredAs !== "literal"
    && change.authoredAs !== "expression"
    && change.authoredAs !== "spread"
    && change.authoredAs !== "default") return null;
  const mountedCount = change.evidence?.mountedCount;
  if (mountedCount !== undefined
    && (!Number.isSafeInteger(mountedCount) || mountedCount < 0)) return null;
  // A rendered-instance semantic record is intentionally never projected as a
  // callsite override. Repeated expression/spread props are equally unsafe to
  // broaden, even when a malformed/internal record asks for source-site scope.
  // Repeated literals remain explicitly source-editable.
  if (mountedCount !== undefined && mountedCount > 1) {
    if (change.scope !== "source-site") return null;
    if (change.authoredAs === "expression" || change.authoredAs === "spread") return null;
  }
  if (change.scope === "rendered-instance") return null;
  return {
    framework: change.target.framework,
    callsiteId: change.target.callsiteId,
    prop: change.property,
    value: change.after,
  };
}
