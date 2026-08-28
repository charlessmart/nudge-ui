/// <reference types="@nudge-ui/css/virtual-design-tokens" />

declare module "virtual:nudge-ui-components" {
  import type { ComponentContract } from "./componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}
