import { readFileSync } from "node:fs";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "nudge-ui/vite";

// The sidebar names the published package version, read from its manifest so a release needs no landing edit.
const { version: nudgeUiVersion } = JSON.parse(readFileSync(new URL("../packages/nudge-ui/package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig(({ command }) => ({
  define: { __NUDGE_UI_VERSION__: JSON.stringify(nudgeUiVersion) },
  // SAFETY: nudgeUi returns a Vite plugin, which Vite's PluginOption union accepts, so the cast only widens to the union member.
  plugins: [react(), nudgeUi({
    demo: true,
    demoPages: [
      "/?landing-version=1",
      "/?landing-version=2",
      "/?landing-layout=split",
      "/?landing-layout=sidebar",
      "/?landing-layout=blueprint",
    ],
    demoCardLabels: ["V1", "V2", "Split", "Sidebar", "Blueprint", "Final"],
    // Sketch falls back to clipboard without an agent; iterations write filesystem artifacts, so they stay dev-only.
    features: { canvasIterations: command === "serve", sketch: true },
    projectId: "nudge-ui-landing-demo",
  }) as PluginOption],
  server: {
    port: 5180,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
