import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";
import { uiIntegrationTestFiles } from "./vitest.ui.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, ...uiIntegrationTestFiles],
    },
  }),
);
