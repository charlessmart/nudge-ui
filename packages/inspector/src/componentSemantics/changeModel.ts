import type {
  ComponentChangeRecord,
  ComponentOverride,
  ComponentPropBaseline,
  ComponentPropContract,
  ComponentPropValue,
  EditableComponentTarget,
} from "./types.ts";

function isPropValue(value: unknown): value is ComponentPropValue {
  return typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

export function componentPropBaseline(value: unknown): ComponentPropBaseline {
  return isPropValue(value)
    ? { kind: "value", value }
    : { kind: "default" };
}

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
  };
}

export function componentChangeToOverride(
  change: ComponentChangeRecord,
): ComponentOverride {
  return {
    framework: change.target.framework,
    callsiteId: change.target.callsiteId,
    prop: change.property,
    value: change.after,
  };
}
