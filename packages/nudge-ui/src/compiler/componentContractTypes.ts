export type ComponentPropValue = string | number | boolean;

export interface ComponentPropContract {
  name: string;
  /**
   * `text` is deliberately separate from a select. Text edits are allowed to
   * choose an arbitrary string at runtime, while select controls are bounded
   * by their contract options.
   */
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

/**
 * One instrumented JSX callsite, as the compiler emits it into wrapped
 * boundaries and callsite registrations, and as the runtime reads it back.
 */
export interface ComponentInvocationMeta {
  callsiteId: string;
  componentId: string;
  componentName: string;
  file: string;
  line: number;
  column: number;
  authoredProps: Record<string, AuthoredInvocationPropKind>;
}
