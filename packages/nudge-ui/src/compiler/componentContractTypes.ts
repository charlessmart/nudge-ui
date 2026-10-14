export type ComponentPropValue = string | number | boolean;

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

/** How a prop was written at its callsite; `default` exists only at runtime, for omitted props. */
export type AuthoredInvocationPropKind = "literal" | "expression" | "spread";

export interface ComponentInvocationMeta {
  callsiteId: string;
  componentId: string;
  componentName: string;
  file: string;
  line: number;
  column: number;
  authoredProps: Record<string, AuthoredInvocationPropKind>;
}
