/// <reference path="../css/virtual-design-tokens.d.ts" />

declare module "virtual:nudge-ui-components" {
  import type { ComponentContract } from "./componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}
