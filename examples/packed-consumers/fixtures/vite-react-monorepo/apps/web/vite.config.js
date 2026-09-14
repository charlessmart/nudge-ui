import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { withNudgeUi } from "nudge-ui/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export default withNudgeUi(defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __PACKED_MODE__: JSON.stringify(mode) },
})), {
  sourceRoots: [resolve(fileURLToPath(new URL("../../packages/ui", import.meta.url)))],
});
