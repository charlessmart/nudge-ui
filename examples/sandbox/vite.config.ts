import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { designTool } from "@design-tool/plugin";

export default defineConfig({
  // @design-tool/plugin is a workspace package with Vite in its own dependency
  // graph. The cast keeps Vite's plugin typing local to this app's Vite instance.
  plugins: [react(), tailwindcss(), designTool() as unknown as PluginOption],
  server: { port: 5173, strictPort: true },
});
