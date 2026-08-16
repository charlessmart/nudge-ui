import type { RuntimeProps } from "./runtimeTypes.ts";

export type ComponentPropValue = string | number | boolean;
export type AuthoredPropKind = "literal" | "expression" | "spread" | "default";
export type ComponentFramework = "react";

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
}

export interface ComponentPropContract {
  name: string;
  control: "select" | "boolean";
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
}
