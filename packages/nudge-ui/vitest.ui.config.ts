import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

/** Rendered-control suites that run in their own CI job instead of the fast unit run. */
export const uiIntegrationTestFiles = [
  "src/inspector/styleEditors/LayoutSection.test.tsx",
  "src/inspector/styleEditors/LayoutComboField.test.tsx",
  "src/inspector/ui/ui.test.tsx",
  "src/inspector/styleEditors/LayoutDropdown.test.tsx",
  "src/inspector/tokens/TokenField.test.tsx",
  "src/inspector/styleEditors/Typography.test.tsx",
  "src/inspector/styleEditors/BorderEditor.test.tsx",
];

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: uiIntegrationTestFiles,
    },
  }),
);
