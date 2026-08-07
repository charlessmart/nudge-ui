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

      // The serialized generation retains the inventory fingerprint and adds
      // a catalog revision for post-snapshot transport enrichment. Declaration
      // identity still comes from the inventory (not reassigned inside load()).
      const publishedGeneration = JSON.parse(extract(code, "tokenGeneration")) as string;
      const expected = createTokenInventory();
      expected.apply({
        buildTool: "vite",
        id: "tracer.css",
        stage: "authored",
        provenance: "project",
        content: PLAIN_CSS,
      });
      expect(publishedGeneration).toMatch(new RegExp(`^${expected.snapshot().generation}:\\d+$`));
      const tracer = catalog.find((definition) => definition.cssName === "--color-tracer");
      expect(tracer?.declarations[0]).toMatchObject({
        id: `vite\u0000tracer.css\u0000authored\u0000--color-tracer\u0000tracer.css:3\u0000{"selector":":root"}\u00001`,
        order: 1,
      });

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

  it("replaces authored rows with transformed rows and removes both stages on deletion", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-tracer-stages-"));
    const cssPath = join(root, "tracer.css");
    try {
      writeFileSync(cssPath, PLAIN_CSS);
      const virtual = { id: "\0virtual:design-tokens" };
      const server = {
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => { throw new Error("deleted"); },
        moduleGraph: {
          getModuleById: (id: string) => id === virtual.id ? virtual : undefined,
          invalidateModule: () => undefined,
        },
      };
      const plugin = designTool() as unknown as {
        configResolved(config: { root: string; command: "serve" | "build" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        transform: { handler(code: string, id: string): unknown };
        load(id: string): string | null | Promise<string | null>;
        handleHotUpdate(context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }): Promise<unknown>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer(server);
      plugin.buildStart();
      await plugin.load("\0virtual:design-tokens");
      plugin.transform.handler(":root { --transformed-only: 8px; }", cssPath);

      const transformed = (await plugin.load("\0virtual:design-tokens"))!;
      expect(transformed).toContain("--transformed-only");
      expect(transformed).not.toContain("--space-tracer");

      rmSync(cssPath);
      await plugin.handleHotUpdate({
        file: cssPath,
        read: async () => { throw new Error("deleted"); },
        server,
        modules: [],
      });
      const removed = (await plugin.load("\0virtual:design-tokens"))!;
      expect(removed).not.toContain("--transformed-only");
      expect(removed).not.toContain("--space-tracer");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the last valid token rows when an existing stylesheet cannot be read during HMR", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-tracer-unreadable-"));
    const cssPath = join(root, "tracer.css");
    try {
      writeFileSync(cssPath, PLAIN_CSS);
      const virtual = { id: "\0virtual:design-tokens" };
      const plugin = designTool() as unknown as {
        configResolved(config: { root: string; command: "serve" | "build" }): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
        handleHotUpdate(context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }): Promise<unknown>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.buildStart();
      await plugin.load("\0virtual:design-tokens");

      await plugin.handleHotUpdate({
        file: cssPath,
        read: async () => { throw new Error("temporarily unreadable"); },
        server: {
          moduleGraph: {
            getModuleById: (id: string) => id === virtual.id ? virtual : undefined,
            invalidateModule: () => undefined,
          },
        },
        modules: [],
      });

      const code = (await plugin.load("\0virtual:design-tokens"))!;
      expect(code).toContain("--color-tracer");
      expect(code).toContain("stylesheet-unreadable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes unresolved active-import diagnostics without dropping valid CSS", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-tracer-diagnostics-"));
    try {
      writeFileSync(join(root, "tracer.css"), '@import "./missing.css"; :root { --still-valid: 1rem; }');
      const plugin = designTool() as unknown as {
        configResolved(config: { root: string; command: "serve" | "build" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer({
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => null,
      });
      plugin.buildStart();

      const code = (await plugin.load("\0virtual:design-tokens"))!;
      const diagnostics = JSON.parse(extract(code, "tokenDiagnostics")) as Array<{
        code: string;
        module?: string;
      }>;
      expect(code).toContain("--still-valid");
      expect(diagnostics).toContainEqual(expect.objectContaining({
        code: "stylesheet-unresolved",
        module: "./missing.css",
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
