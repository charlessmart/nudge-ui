import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __PACKED_MODE__: JSON.stringify(mode) },
}));
