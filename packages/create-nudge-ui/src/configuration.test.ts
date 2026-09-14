import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configureSource, planConfiguration } from "./configuration.ts";

describe("planConfiguration", () => {
  const withProject = (files: Readonly<Record<string, string>>, run: (root: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-config-"));
    try {
      for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("updates an existing CommonJS Vite config instead of creating a shadowing ESM one", () => {
    withProject({ "vite.config.cjs": 'module.exports = { plugins: [] };\n' }, (root) => {
      const change = planConfiguration(root, "vite-react");

      expect(change?.created).toBe(false);
      expect(change?.path).toBe(join(root, "vite.config.cjs"));
      expect(change?.content).toContain(
        'const { withNudgeUi } = require("nudge-ui/vite");',
      );
      expect(change?.content).toContain("module.exports = withNudgeUi({ plugins: [] });");
    });
  });

  it("prefers the config file Vite itself would load", () => {
    withProject({
      "vite.config.js": "export default { plugins: [] };\n",
      "vite.config.ts": "export default { plugins: [] };\n",
    }, (root) => {
      // Vite's DEFAULT_CONFIG_FILES order puts .js first, so editing .ts would
      // silently no-op against the configuration Vite actually loads.
      expect(planConfiguration(root, "vite-react")?.path).toBe(join(root, "vite.config.js"));
    });
  });
});

describe("configureSource", () => {
  it("wraps an Astro configuration without inspecting its integrations", () => {
    const source = `import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [],
});
`;
    const configured = configureSource(source, "astro", "astro.config.ts");
    expect(configured).toContain('import { withNudgeUi } from "nudge-ui/astro";');
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

  it("uses the local name of a renamed Astro wrapper import", () => {
    const source = 'import { withNudgeUi as withInspector } from "nudge-ui/astro";\nexport default {};\n';
    const configured = configureSource(source, "astro", "astro.config.mjs");
    expect(configured).toContain("export default withInspector({})");
    expect(configured).not.toContain("withNudgeUi({})");
  });

  it("avoids local binding collisions when importing the Astro wrapper", () => {
    const source = "const withNudgeUi = () => 'local';\nexport default {};\n";
    const configured = configureSource(source, "astro", "astro.config.mjs");
    expect(configured).toContain(
      'import { withNudgeUi as withNudgeUi2 } from "nudge-ui/astro";',
    );
    expect(configured).toContain("export default withNudgeUi2({})");
  });

  it("wraps a Vite configuration export without inspecting its shape", () => {
    const source = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;
    const configured = configureSource(source, "vite-react", "vite.config.ts");
    expect(configured).toContain('import { withNudgeUi } from "nudge-ui/vite";');
    expect(configured).toContain("export default withNudgeUi(defineConfig({");
    expect(configureSource(configured, "vite-react", "vite.config.ts")).toBe(configured);
  });

  it("wraps callback, spread, and computed Vite configurations", () => {
    const source = `import { defineConfig } from "vite";

const shared = { plugins: [] };
export default defineConfig(({ mode }) => ({
  ...shared,
  root: mode === "test" ? "test" : undefined,
}));
`;
    const configured = configureSource(source, "vite-react", "vite.config.ts");
    expect(configured).toContain("export default withNudgeUi(defineConfig(({ mode }) => ({");
    expect(configured).toContain("const shared = { plugins: [] };");
    expect(configured).toContain('import { withNudgeUi } from "nudge-ui/vite";');
  });

  it("wraps CommonJS Vite exports", () => {
    const source = `const { defineConfig } = require("vite");
module.exports = defineConfig(() => ({ plugins: [] }));
`;
    const configured = configureSource(source, "vite-react", "vite.config.cjs");
    expect(configured).toContain(
      'const { withNudgeUi } = require("nudge-ui/vite");',
    );
    expect(configured).toContain(
      "module.exports = withNudgeUi(defineConfig(() => ({ plugins: [] })));",
    );
    expect(configureSource(configured, "vite-react", "vite.config.cjs")).toBe(configured);
  });

  it("avoids a local Vite wrapper binding collision", () => {
    const source = `const withNudgeUi = (config) => config;
export default { root: "app" };
`;
    const configured = configureSource(source, "vite-react", "vite.config.ts");
    expect(configured).toContain(
      'import { withNudgeUi as withNudgeUi2 } from "nudge-ui/vite";',
    );
    expect(configured).toContain("export default withNudgeUi2({ root: \"app\" });");
  });

  it("preserves an aliased CommonJS Vite wrapper binding", () => {
    const source = `const { withNudgeUi: withInspector } = require("nudge-ui/vite");
module.exports = {};
`;
    const configured = configureSource(source, "vite-react", "vite.config.cjs");
    expect(configured).toContain("module.exports = withInspector({});");
    expect(configured.match(/require\("nudge-ui\/vite"\)/g)).toHaveLength(1);
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
    expect(configured).toContain('import { withNudgeUi } from "nudge-ui/next";');
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
    const source = 'import { withNudgeUi } from "nudge-ui/next";\nconst config = {};\nexport default withNudgeUi (config);\n';
    expect(configureSource(source, "nextjs", "next.config.mjs")).toBe(source);
  });

  it("recognizes an already wrapped Vite export without adding another wrapper", () => {
    const source = 'import { withNudgeUi } from "nudge-ui/vite";\nexport default withNudgeUi({});\n';
    expect(configureSource(source, "vite-react", "vite.config.ts")).toBe(source);
  });

  it("recognizes adapter calls with options as already configured", () => {
    const source = `import { defineConfig } from "astro/config";
import { nudgeUiAstro } from "nudge-ui/astro";
export default defineConfig({
  integrations: [nudgeUiAstro({ debug: true })],
});
`;
    const configured = configureSource(source, "astro", "astro.config.ts");
    expect(configured).toContain("export default withNudgeUi(defineConfig({");
    expect(configureSource(configured, "astro", "astro.config.ts")).toBe(configured);
  });

  it("does not mistake an unrelated nudgeUiAstro call for configuration", () => {
    const source = "function preview() { nudgeUiAstro(); }\nexport default {};\n";
    expect(configureSource(source, "astro", "astro.config.mjs")).toContain(
      "export default withNudgeUi({})",
    );
  });

  it("wraps Astro configs that omit integrations", () => {
    const astro = 'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n';
    expect(configureSource(astro, "astro", "astro.config.mjs")).toContain(
      "export default withNudgeUi(defineConfig({}))",
    );
  });

  it("rejects Vite sources without a single export", () => {
    expect(() => configureSource("const config = {};", "vite-react", "vite.config.ts"))
      .toThrow(/Could not update the Vite configuration/);
  });
});
