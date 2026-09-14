import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const compilerSource = (file: string) =>
  fileURLToPath(new URL(`../compiler/src/${file}`, import.meta.url));

// Aliases are exact-match RegExps so the root entry point cannot swallow the
// documented subpaths. Tests exercise compiler source directly; resolving the
// package entry point through node_modules would require — and could silently
// test against — a stale `dist` build.
export default defineConfig({
  resolve: {
    alias: [
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
