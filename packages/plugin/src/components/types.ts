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
