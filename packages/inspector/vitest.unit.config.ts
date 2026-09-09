import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const uiIntegrationTestFiles = [
  "src/styleEditors/LayoutSection.test.tsx",
  "src/styleEditors/LayoutComboField.test.tsx",
  "src/tokens/TokenDropdown.test.tsx",
  "src/ui/ui.test.tsx",
  "src/styleEditors/LayoutDropdown.test.tsx",
  "src/tokens/TokenField.test.tsx",
  "src/styleEditors/Typography.test.tsx",
  "src/styleEditors/BorderEditor.test.tsx",
  "src/styleEditors/AspectRatioField.test.tsx",
];

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, ...uiIntegrationTestFiles],
    },
  }),
);
