import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTokenInventory } from "@design-tool/css/token-inventory";
import { designTool } from "./index.ts";

const PLAIN_CSS = `:root {
  --space-tracer: 24px;
  --color-tracer: #123456;
}`;

function extract(code: string, name: string): string {
  return new RegExp(`^export const ${name} = (.*);$`, "m").exec(code)?.[1] ?? "undefined";
}

describe("designTool plain-CSS token inventory transport", () => {
  it("publishes the inventory snapshot and its generation through the virtual module without rebuilding identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-tracer-"));
    try {
      writeFileSync(join(root, "tracer.css"), PLAIN_CSS);
      const plugin = designTool() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.buildStart!();

      const code = (await plugin.load!("\0virtual:design-tokens"))!;
      const catalog = JSON.parse(extract(code, "tokenCatalog")) as Array<{
        cssName: string;
        origin?: string;
        declarations: Array<{ id?: string; order?: number; value: string }>;
      }>;
      expect(catalog.find((definition) => definition.cssName === "--space-tracer"))
        .toMatchObject({ origin: "project" });
      expect(catalog.find((definition) => definition.cssName === "--color-tracer"))
        .toMatchObject({ origin: "project" });

      // The serialized generation is the inventory snapshot fingerprint for
      // the exact artifact the plugin fed, and the declaration identity comes
      // from the inventory (not reassigned inside load()).
      const publishedGeneration = JSON.parse(extract(code, "tokenGeneration")) as string;
      const expected = createTokenInventory();
      expected.apply({
        buildTool: "vite",
        id: "tracer.css",
        stage: "authored",
        provenance: "project",
        content: PLAIN_CSS,
      });
      expect(publishedGeneration).toBe(expected.snapshot().generation);
      const tracer = catalog.find((definition) => definition.cssName === "--color-tracer");
      expect(tracer?.declarations[0]).toMatchObject({ id: `--color-tracer\u0000tracer.css:3\u0000{"selector":":root"}\u00001`, order: 1 });

      // Identical reloads publish the identical generation (deterministic).
      const again = (await plugin.load!("\0virtual:design-tokens"))!;
      expect(JSON.parse(extract(again, "tokenGeneration")) as string).toBe(publishedGeneration);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("bumps the published generation when a plain-CSS artifact changes and drops removed rows", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-tracer-hmr-"));
    const cssPath = join(root, "tracer.css");
    try {
      writeFileSync(cssPath, PLAIN_CSS);
      const virtual = { id: "\0virtual:design-tokens" };
      const server = {
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => null,
        moduleGraph: {
          getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
          invalidateModule: () => undefined,
        },
      };
      const plugin = designTool() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

      const first = (await plugin.load!("\0virtual:design-tokens"))!;
      const firstGeneration = JSON.parse(extract(first, "tokenGeneration")) as string;

      writeFileSync(cssPath, ":root { --color-tracer: #abcdef; --extra-tracer: 4px; }");
      await plugin.handleHotUpdate!({
        file: cssPath,
        read: async () => ":root { --color-tracer: #abcdef; --extra-tracer: 4px; }",
        server,
        modules: [],
      });
      const second = (await plugin.load!("\0virtual:design-tokens"))!;
      expect(JSON.parse(extract(second, "tokenGeneration")) as string).not.toBe(firstGeneration);
      expect(second).toContain("--extra-tracer");
      expect(second).toContain("#abcdef");
      expect(second).not.toContain("--space-tracer");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
