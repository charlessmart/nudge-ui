import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const compilerSource = fileURLToPath(new URL("../compiler/src/reactIdentity.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@nudge-ui/compiler/react-identity": compilerSource,
    },
  },
});
