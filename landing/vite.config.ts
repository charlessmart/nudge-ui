import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "nudge-ui/vite";

export default defineConfig({
  // SAFETY: nudgeUi returns a Vite plugin, which Vite's PluginOption union accepts, so the cast only widens to the union member.
  plugins: [react(), nudgeUi({
    demo: true,
    demoPages: ["/", "/?nudge-egg=1"],
    projectId: "nudge-ui-landing-demo",
  }) as PluginOption],
  server: {
    port: 5180,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
