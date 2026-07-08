import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { designTool } from "@design-tool/plugin";

export default defineConfig({
  plugins: [react(), designTool()],
  server: { port: 5173, strictPort: true },
});