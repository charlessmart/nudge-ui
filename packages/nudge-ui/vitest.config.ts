import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const compilerSource = (file: string) =>
  fileURLToPath(new URL(`../compiler/src/${file}`, import.meta.url));

// Aliases are exact-match RegExps so the root entry point cannot swallow the
// documented subpaths. Tests exercise compiler source directly; resolving the
// package entry point through node_modules would require — and could silently
// test against — a stale `dist` build.
export default defineConfig({
  test: {
    // The Next.js host suites spawn real sidecar processes and debounced
    // filesystem watchers. Running files concurrently makes them contend for
    // those resources, so a settled batch can miss its timing window.
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
