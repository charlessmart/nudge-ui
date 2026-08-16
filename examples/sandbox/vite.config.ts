import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
// Load the workspace source directly so Vite's config bundler does not ask
// Node to execute the package's unbundled .ts entry during Playwright startup.
import { designTool } from "../../packages/plugin/src/index.ts";

export default defineConfig({
  // @design-tool/plugin is a workspace package with Vite in its own dependency
  // graph. The cast keeps Vite's plugin typing local to this app's Vite instance.
  // SAFETY: designTool returns Plugin[]; this app accepts it as a PluginOption after the local Vite type mismatch.
  plugins: [react(), designTool() as PluginOption],
  server: { port: 5173, strictPort: true, host: "0.0.0.0", allowedHosts: true },
});
