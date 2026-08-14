import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { designTool } from "../../packages/plugin/src/index.ts";
import type { TailwindV3Config } from "../../packages/plugin/src/index.ts";
import { tailwindConfig } from "./tailwind.config.ts";

export default defineConfig({
  plugins: [
    react(),
    designTool({
      projectId: "sandbox-tailwind-v3",
      tailwindV3: {
        config: tailwindConfig as unknown as TailwindV3Config,
        source: "tailwind.config.ts",
      },
    }) as unknown as PluginOption,
  ],
  server: { port: 5175, strictPort: true, host: "127.0.0.1" },
});
