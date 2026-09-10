import { describe, expect, it } from "vitest";
import { configureSource } from "./configuration.ts";

describe("configureSource", () => {
  it("wraps an Astro configuration without inspecting its integrations", () => {
    const source = `import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [],
});
`;
    const configured = configureSource(source, "astro", "astro.config.ts");
    expect(configured).toContain('import { withNudgeUi } from "@nudge-ui/astro";');
    expect(configured).toContain("export default withNudgeUi(defineConfig({");
    expect(configureSource(configured, "astro", "astro.config.ts")).toBe(configured);
  });

  it("wraps Astro shorthand, variable, and spread integration lists", () => {
    const source = `import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

const integrations = [mdx()];
export default defineConfig({ integrations, ...getOverrides() });
`;
    const configured = configureSource(source, "astro", "astro.config.mjs");
    expect(configured).toContain("withNudgeUi(defineConfig({ integrations, ...getOverrides() }))");
    expect(configureSource(configured, "astro", "astro.config.mjs")).toBe(configured);
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

  it("wraps complete Next.js wrapper and satisfies expressions", () => {
    const wrapped = "const nextConfig = {};\nexport default withMDX(nextConfig);\n";
    const satisfies = "const nextConfig = {};\nexport default nextConfig satisfies NextConfig;\n";
    expect(configureSource(wrapped, "nextjs", "next.config.mjs")).toContain(
      "export default withNudgeUi(withMDX(nextConfig));",
    );
    expect(configureSource(satisfies, "nextjs", "next.config.ts")).toContain(
      "export default withNudgeUi(nextConfig satisfies NextConfig);",
    );
  });

  it("ignores module.exports text in comments when selecting the module format", () => {
    const source = "// module.exports = oldConfig\nconst nextConfig = {};\nexport default nextConfig;\n";
    const configured = configureSource(source, "nextjs", "next.config.mjs");
    expect(configured).toContain("// module.exports = oldConfig");
    expect(configured).toContain('import { withNudgeUi } from "@nudge-ui/nextjs";');
    expect(configured).toContain("export default withNudgeUi(nextConfig);");
    expect(configured).not.toContain("require(");
  });

  it("supports inline Next.js object and function exports", () => {
    expect(configureSource("export default { reactStrictMode: true };", "nextjs", "next.config.mjs"))
      .toContain("export default withNudgeUi({ reactStrictMode: true });");
    expect(configureSource("module.exports = { reactStrictMode: true };", "nextjs", "next.config.js"))
      .toContain("module.exports = withNudgeUi({ reactStrictMode: true });");
    expect(configureSource("export default (phase) => ({ phase });", "nextjs", "next.config.mjs"))
      .toContain("export default withNudgeUi((phase) => ({ phase }));");
  });

  it("recognizes existing Next.js wrappers despite call spacing", () => {
    const source = 'import { withNudgeUi } from "@nudge-ui/nextjs";\nconst config = {};\nexport default withNudgeUi (config);\n';
    expect(configureSource(source, "nextjs", "next.config.mjs")).toBe(source);
  });

  it("updates quoted array properties without creating duplicates", () => {
    const source = 'import { defineConfig } from "vite";\nexport default defineConfig({ "plugins": [] });\n';
    const configured = configureSource(source, "vite-react", "vite.config.ts");
    expect(configured).toMatch(/"plugins": \[\n\s+\.\.\.nudgeUi\(\),/);
    expect(configured.match(/plugins/g)).toHaveLength(1);
  });

  it("recognizes adapter calls with options as already configured", () => {
    const source = `import { defineConfig } from "astro/config";
import { nudgeUiAstro } from "@nudge-ui/astro";
export default defineConfig({
  integrations: [nudgeUiAstro({ debug: true })],
});
`;
    expect(configureSource(source, "astro", "astro.config.ts")).toBe(source);
  });

  it("wraps Astro configs that omit integrations", () => {
    const astro = 'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n';
    expect(configureSource(astro, "astro", "astro.config.mjs")).toContain(
      "export default withNudgeUi(defineConfig({}))",
    );
  });

  it("rejects configuration shapes it cannot update safely", () => {
    expect(() => configureSource("export default getConfig();", "vite-react", "vite.config.ts"))
      .toThrow(/Could not update plugins/);
    expect(() => configureSource('export default defineConfig({ plugins: getPlugins() });', "vite-react", "vite.config.ts"))
      .toThrow(/plugins to be an array/);
    expect(() => configureSource('export default defineConfig({ plugins: [], "plugins": [] });', "vite-react", "vite.config.ts"))
      .toThrow(/duplicate plugins/);
  });
});
