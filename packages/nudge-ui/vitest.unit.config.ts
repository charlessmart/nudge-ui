import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const uiIntegrationTestFiles = [
  "src/inspector/styleEditors/LayoutSection.test.tsx",
  "src/inspector/styleEditors/LayoutComboField.test.tsx",
  "src/inspector/tokens/TokenDropdown.test.tsx",
  "src/inspector/ui/ui.test.tsx",
  "src/inspector/styleEditors/LayoutDropdown.test.tsx",
  "src/inspector/tokens/TokenField.test.tsx",
  "src/inspector/styleEditors/Typography.test.tsx",
  "src/inspector/styleEditors/BorderEditor.test.tsx",
  "src/inspector/styleEditors/AspectRatioField.test.tsx",
];

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, ...uiIntegrationTestFiles],
    },
  }),
);
