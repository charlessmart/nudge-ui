import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "nudge-ui/vite";

export default defineConfig({
  // SAFETY: nudgeUi returns the plugin graph for its own Vite instance; this
  // app accepts it as a PluginOption across the local Vite type boundary.
  plugins: [
    react(),
    nudgeUi({
      projectId: "nudge-ui-mockup-cards",
    }) as PluginOption,
  ],
  server: {
    port: 5190,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
