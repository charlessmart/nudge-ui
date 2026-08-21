import type { ComponentContract } from "../componentSemantics/types.ts";
import { getDesignToolRuntimeConfig } from "../runtimeConfig.ts";

export const componentContracts = getDesignToolRuntimeConfig().componentContracts as ComponentContract[];
export default componentContracts;
