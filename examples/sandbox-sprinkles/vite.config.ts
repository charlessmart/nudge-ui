import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { designTool } from "../../packages/plugin/src/index.ts";

export default defineConfig({
  plugins: [
    react(),
    // Short identifiers intentionally remove semantic hints from generated
    // class and custom-property names. The compiled contract is the only safe
    // source of theme.color.* attribution in this fixture.
    vanillaExtractPlugin({ identifiers: "short" }),
    designTool({
      projectId: "sandbox-sprinkles",
      vanillaExtract: {
        themeContractModule: "/src/theme.css.ts",
        themeContractExport: "vars",
        source: "src/theme.css.ts",
      },
    }) as unknown as PluginOption,
  ],
  server: { port: 5176, strictPort: true, host: "127.0.0.1" },
});
