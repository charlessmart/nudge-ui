import type { RuntimeProps } from "./runtimeTypes.ts";
import type { EditScope } from "../editScope.ts";
import type { ComponentInvocationMeta } from "../../compiler/componentContractTypes.ts";

export type ComponentPropValue = string | number | boolean;
export type AuthoredPropKind = "literal" | "expression" | "spread" | "default";
export const COMPONENT_FRAMEWORKS = ["react"] as const;
export type ComponentFramework = (typeof COMPONENT_FRAMEWORKS)[number];
export type ComponentChangeScope = EditScope;

export function isComponentFramework(value: string): value is ComponentFramework {
  return COMPONENT_FRAMEWORKS.some((framework) => framework === value);
}

/** Deliberately JSON data, never a DOM node or a React fiber. */
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
  scope?: ComponentChangeScope;
  evidence?: ComponentInvocationEvidence;
}

/** The compiler owns this wire format; the runtime only reads it. */
export type { ComponentInvocationMeta };

export interface RuntimeComponentTarget {
  framework: ComponentFramework;
  meta: ComponentInvocationMeta;
  props: RuntimeProps;
  mountedCount?: number;
  /** False when the runtime cannot render a prop change (the change still reaches the prompt); absent means live. */
  livePreview?: boolean;
}

/** A component invocation whose entire rendered output is one DOM element. */
export interface ComponentRootInvocation {
  callsiteId: string;
  componentName: string;
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
  /** A runtime that cannot prove the count must return null so callers fail closed. */
  getCallsiteMultiplicity?(callsiteId: string): number | null | undefined;
  /** Nearest first; null when the runtime cannot read the element's ancestry, so structural identity fails closed. */
  rootInvocations?(element: HTMLElement): ComponentRootInvocation[] | null;
}
