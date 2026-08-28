import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { nudgeUiAstro } from "@nudge-ui/astro";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), nudgeUiAstro()],
});
