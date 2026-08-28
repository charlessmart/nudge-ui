import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "virtual:design-tokens": fileURLToPath(
        new URL("./src/__stubs__/design-tokens.ts", import.meta.url),
      ),
      "virtual:nudge-ui-components": fileURLToPath(
        new URL("./src/__stubs__/nudge-ui-components.ts", import.meta.url),
      ),
    },
  },
});
