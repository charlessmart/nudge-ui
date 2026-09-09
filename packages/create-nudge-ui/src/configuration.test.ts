import { describe, expect, it } from "vitest";
import { configureSource } from "./configuration.ts";

describe("configureSource", () => {
  it("adds the Astro adapter to an existing integrations array", () => {
    const source = `import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [],
});
`;
    const configured = configureSource(source, "astro", "astro.config.ts");
    expect(configured).toContain('import { nudgeUiAstro } from "@nudge-ui/astro";');
    expect(configured).toContain("integrations: [\n    nudgeUiAstro(),");
    expect(configureSource(configured, "astro", "astro.config.ts")).toBe(configured);
  });

  it("adds the Vite adapter after existing plugins", () => {
    const source = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;
    const configured = configureSource(source, "vite-react", "vite.config.ts");
    expect(configured).toContain('import { nudgeUi } from "@nudge-ui/vite-react";');
    expect(configured).toContain("plugins: [\n    ...nudgeUi(),\n    react()]");
    expect(configureSource(configured, "vite-react", "vite.config.ts")).toBe(configured);
  });

  it("wraps ESM and CommonJS Next.js configuration exports", () => {
    const esm = "const nextConfig = {};\n\nexport default nextConfig;\n";
    const commonJs = "const nextConfig = {};\n\nmodule.exports = nextConfig;\n";
    expect(configureSource(esm, "nextjs", "next.config.mjs")).toContain(
      "export default withNudgeUi(nextConfig);",
    );
    expect(configureSource(commonJs, "nextjs", "next.config.cjs")).toContain(
      "module.exports = withNudgeUi(nextConfig);",
    );
  });

  it("adds missing array properties to conventional defineConfig calls", () => {
    const astro = 'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n';
    expect(configureSource(astro, "astro", "astro.config.mjs")).toContain(
      "integrations: [nudgeUiAstro()]",
    );
  });

  it("rejects configuration shapes it cannot update safely", () => {
    expect(() => configureSource("export default getConfig();", "vite-react", "vite.config.ts"))
      .toThrow(/Could not update plugins/);
    expect(() => configureSource("export default {};", "nextjs", "next.config.mjs"))
      .toThrow(/exported configuration variable/);
  });
});
