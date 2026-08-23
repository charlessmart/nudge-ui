import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { designToolAstro } from "@design-tool/astro";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), designToolAstro()],
});
