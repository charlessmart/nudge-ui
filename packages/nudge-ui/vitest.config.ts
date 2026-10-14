import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cursor images resolve their default tokens from the foundation stylesheet.
    css: { include: [/Foundation\.css/] },
    // Next.js suites spawn real sidecars and debounced watchers; parallel files contend and miss their window.
    fileParallelism: false,
    testTimeout: 20_000,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "virtual:design-tokens",
        replacement: fileURLToPath(new URL("./src/inspector/__stubs__/design-tokens.ts", import.meta.url)),
      },
      {
        find: "virtual:nudge-ui-components",
        replacement: fileURLToPath(new URL("./src/inspector/__stubs__/nudge-ui-components.ts", import.meta.url)),
      },
    ],
  },
});
