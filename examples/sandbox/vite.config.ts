import { fileURLToPath } from "node:url";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
// Load the workspace source directly so Vite's config bundler does not ask
// Node to execute the package's unbundled .ts entry during Playwright startup.
import { nudgeUi } from "../../packages/plugin/src/index.ts";

// Keep the primary sandbox on the inspector source graph so Vite can HMR UI and CSS edits.
const inspectorSourceEntry = fileURLToPath(new URL("../../packages/inspector/src/index.ts", import.meta.url));
const inspectorTestingSourceEntry = fileURLToPath(new URL("../../packages/inspector/src/testing.ts", import.meta.url));

export default defineConfig({
  // @nudge-ui/vite-react is a workspace package with Vite in its own dependency
  // graph. The cast keeps Vite's plugin typing local to this app's Vite instance.
  // SAFETY: nudgeUi returns Plugin[]; this app accepts it as a PluginOption after the local Vite type mismatch.
  plugins: [react(), nudgeUi() as PluginOption],
  resolve: {
    alias: [
      { find: /^@nudge-ui\/inspector\/testing$/, replacement: inspectorTestingSourceEntry },
      { find: /^@nudge-ui\/inspector$/, replacement: inspectorSourceEntry },
    ],
  },
  server: { port: 5173, strictPort: true, host: "0.0.0.0", allowedHosts: true },
});
