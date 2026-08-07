/// <reference types="@design-tool/css/virtual-design-tokens" />

declare module "virtual:design-tool-components" {
  import type { ComponentContract } from "./componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}
