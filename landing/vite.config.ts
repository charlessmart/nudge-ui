import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "@nudge-ui/vite-react";

export default defineConfig({
  plugins: [react(), nudgeUi({
    demo: true,
    projectId: "nudge-ui-landing-demo",
  }) as PluginOption],
  server: {
    port: 5180,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});