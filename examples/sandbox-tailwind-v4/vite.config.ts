import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { designTool } from "../../packages/plugin/src/index.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    designTool({ projectId: "sandbox-tailwind-v4" }) as unknown as PluginOption,
  ],
  server: { port: 5174, strictPort: true, host: "127.0.0.1" },
});

