import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import { nudgeUiAstro } from "nudge-ui/astro";

export default defineConfig({
  // Keep Astro's source annotations enabled; the installed compiler release may omit them.
  devToolbar: { enabled: true },
  integrations: [react(), mdx(), nudgeUiAstro()],
});
