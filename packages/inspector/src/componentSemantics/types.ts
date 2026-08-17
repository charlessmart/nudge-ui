import type { RuntimeProps } from "./runtimeTypes.ts";

export type ComponentPropValue = string | number | boolean;
export type AuthoredPropKind = "literal" | "expression" | "spread" | "default";
export type ComponentFramework = "react";
export type ComponentChangeScope = "source-site" | "rendered-instance";

/**
 * Bounded evidence for the rendered invocation that a text edit started from.
 * This is deliberately JSON data, never a DOM node or a React fiber.
 */
export interface ComponentInvocationEvidence {
  occurrence: number;
  props: string | null;
  ariaLabel: string | null;
  beforeText: string;
  mountedCount: number;
}

export type ComponentPropBaseline =
  | { kind: "default" }
  | { kind: "value"; value: ComponentPropValue };

export interface ComponentChangeTarget {
  framework: ComponentFramework;
  componentId: string;
  callsiteId: string;
  componentName: string;
  file: string;
  line: number;
  column: number;
}

export interface ComponentChangeRecord {
  kind: "component-prop";
  target: ComponentChangeTarget;
  property: string;
  before: ComponentPropBaseline;
  after: ComponentPropValue;
  authoredAs: AuthoredPropKind;
  /** `source-site` is the historical/default semantic projection scope. */
  scope?: ComponentChangeScope;
  /** Present when an inline scope decision was made from one rendered item. */
  evidence?: ComponentInvocationEvidence;
}

export interface ComponentInvocationMeta {
  callsiteId: string;
  componentId: string;
  componentName: string;
  file: string;
  line: number;
  column: number;
  authoredProps: Record<string, Exclude<AuthoredPropKind, "default">>;
}

export interface RuntimeComponentTarget {
  framework: ComponentFramework;
  meta: ComponentInvocationMeta;
  props: RuntimeProps;
  /** Adapter-reported mounted invocation count for this callsite. */
  mountedCount?: number;
}

export interface ComponentPropContract {
  name: string;
  control: "select" | "boolean" | "text";
  options: ComponentPropValue[];
  optional: boolean;
}

export interface ComponentContract {
  componentId: string;
  name: string;
  file: string;
  props: ComponentPropContract[];
  provenance: "typescript" | "package-manifest";
}

export interface EditableComponentTarget extends RuntimeComponentTarget {
  contract: ComponentContract;
}

export interface ComponentOverride {
  framework: ComponentFramework;
  callsiteId: string;
  prop: string;
  value: ComponentPropValue;
}

export interface ComponentRuntimeAdapter {
  framework: ComponentFramework;
  inspect(element: HTMLElement): RuntimeComponentTarget[];
  replaceOverrides(overrides: ComponentOverride[]): void;
  /**
   * Return the number of currently mounted invocations for a callsite. A
   * runtime that cannot prove this must return null/undefined so callers can
   * fail closed instead of broadening a semantic override.
   */
  getCallsiteMultiplicity?(callsiteId: string): number | null | undefined;
}
