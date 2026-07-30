export type ComponentPropValue = string | number | boolean;

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
