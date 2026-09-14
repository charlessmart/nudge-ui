import path from "node:path";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nudgeUi } from "../../packages/nudge-ui/src/hosts/vite/index.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // SAFETY: nudgeUi returns Plugin[]; this app accepts it as a PluginOption after the local Vite type mismatch.
    nudgeUi({ projectId: "sandbox-tailwind-v4" }) as PluginOption,
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5174, strictPort: true, host: "127.0.0.1" },
});
