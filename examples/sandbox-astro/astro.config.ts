import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { nudgeUiAstro } from "@nudge-ui/astro";

// https://astro.build/config
export default defineConfig({
  // Keep Astro's source-annotation feature enabled when the installed
  // compiler exposes it; the current compiler-rs release may still omit it.
  devToolbar: { enabled: true },
  integrations: [react(), nudgeUiAstro()],
});
