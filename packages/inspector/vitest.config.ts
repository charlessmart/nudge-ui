import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "virtual:design-tokens": fileURLToPath(
        new URL("./src/__stubs__/design-tokens.ts", import.meta.url),
      ),
      "virtual:design-tool-components": fileURLToPath(
        new URL("./src/__stubs__/design-tool-components.ts", import.meta.url),
      ),
    },
  },
});
