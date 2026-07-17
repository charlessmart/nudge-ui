import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Load the workspace source directly so Vite's config bundler does not ask
// Node to execute the package's unbundled .ts entry during Playwright startup.
import { designTool } from "../../packages/plugin/src/index.ts";

export default defineConfig({
  // @design-tool/plugin is a workspace package with Vite in its own dependency
  // graph. The cast keeps Vite's plugin typing local to this app's Vite instance.
  plugins: [react(), tailwindcss(), designTool({
    tailwindV3: { config: { theme: { colors: { brand: "#123456" } } } },
    vanillaExtract: {
      themeContract: { color: { brand: "var(--color-brand__hash)", accent: "var(--color-accent__hash)" } },
      classMap: { "sprinkles-brand": { token: "theme.color.brand", property: "color" } },
      cssValues: { "--color-brand__hash": "#123456", "--color-accent__hash": "#abcdef" },
    },
  }) as unknown as PluginOption],
  server: { port: 5173, strictPort: true },
});
