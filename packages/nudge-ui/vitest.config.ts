import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const compilerSource = (file: string) =>
  fileURLToPath(new URL(`../compiler/src/${file}`, import.meta.url));

// Exact-match RegExps so the root entry cannot swallow the subpaths. Tests run
// against source; resolving through node_modules could silently test a stale `dist`.
export default defineConfig({
  test: {
    // The Next.js suites spawn real sidecar processes and debounced watchers;
    // concurrent files contend for them and a settled batch misses its window.
    fileParallelism: false,
    testTimeout: 20_000,
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
      { find: /^@nudge-ui\/compiler$/, replacement: compilerSource("index.ts") },
      { find: /^@nudge-ui\/compiler\/react-identity$/, replacement: compilerSource("reactIdentity.ts") },
      { find: /^@nudge-ui\/compiler\/component-policy$/, replacement: compilerSource("componentPolicyResolution.ts") },
      {
        find: /^@nudge-ui\/compiler\/react-component-protocols$/,
        replacement: compilerSource("reactComponentProtocols.ts"),
      },
      { find: /^@nudge-ui\/compiler\/component-contracts$/, replacement: compilerSource("componentContracts.ts") },
      {
        find: /^@nudge-ui\/compiler\/package-component-contracts$/,
        replacement: compilerSource("packageComponentContracts.ts"),
      },
    ],
  },
});
