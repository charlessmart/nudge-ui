import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "../../packages/nudge-ui/src/hosts/vite/index.ts";
import type { TailwindV3Config } from "../../packages/nudge-ui/src/hosts/vite/index.ts";
import { tailwindConfig } from "./tailwind.config.ts";

export default defineConfig({
  plugins: [
    react(),
    // SAFETY: nudgeUi returns Plugin[]; this app accepts it as a PluginOption after the local Vite type mismatch.
    nudgeUi({
      projectId: "sandbox-tailwind-v3",
      tailwindV3: {
        // SAFETY: tailwindConfig is structurally a TailwindV3Config; only the imported type differs across workspace versions.
        config: tailwindConfig as TailwindV3Config,
        source: "tailwind.config.ts",
      },
    }) as PluginOption,
  ],
  server: { port: 5175, strictPort: true, host: "127.0.0.1" },
});
