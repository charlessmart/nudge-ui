import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVitePlugins } from "./vite.ts";
import { createReactSupport } from "./react.ts";

/**
 * The Vite host composed with no framework, which is the proof obligation for
 * splitting `./vite.ts` from `./react.ts`. It must still do everything the
 * build tool owns — observe stylesheets, publish tokens, serve the transport,
 * inject the bootstrap — and must not touch a source module or ask anything of
 * Vite's module resolution.
 */

const STYLESHEET = ":root { --brand: #123456; --space: 8px; }";

const COMPONENT_SOURCE = `export function Card(props: { tone: "quiet" | "loud" }) {
  return <div className={props.tone}>hello</div>;
}`;

interface HostPlugin {
  config?: (
    config: { root?: string; resolve?: { dedupe?: string[] } },
    env: { command: "serve" | "build" },
  ) => unknown;
  configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
  buildStart?: () => void;
  resolveId?: (id: string) => string | null;
  load?: (id: string) => string | null | Promise<string | null>;
  transform?: { handler: (code: string, id: string) => unknown };
  transformIndexHtml?: (html: string) => string | undefined;
}

function frameworkFreeHost(root: string): HostPlugin {
  // SAFETY: the returned Vite plugin is exercised through the hooks declared above.
  const plugin = createVitePlugins({}, null)[0] as unknown as HostPlugin;
  plugin.configResolved!({ root, command: "serve" });
  return plugin;
}

/** Drives the transport middleware and returns the manifest it served. */
async function manifestFor(plugins: readonly unknown[], root: string): Promise<{
  runtime: {
    host: string;
    framework: string;
    capabilities: { componentSemantics: boolean };
    componentContracts: Array<{ componentId: string }>;
  };
}> {
  type Middleware = (
    request: { url: string; method: string },
    response: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void },
    next: () => void,
  ) => Promise<void>;
  // SAFETY: the returned Vite plugin is exercised through the hooks declared here.
  const plugin = plugins[0] as unknown as HostPlugin & {
    configureServer(server: unknown): void;
  };
  let middleware: Middleware | undefined;
  plugin.configResolved!({ root, command: "serve" });
  plugin.configureServer({
    config: { logger: { warn: () => undefined } },
    middlewares: { use: (handler: Middleware) => { middleware = handler; } },
    watcher: { on: () => undefined },
  });
  plugin.buildStart!();

  let body = "";
  await middleware!(
    { url: "/__nudge_ui__/manifest", method: "GET" },
    { statusCode: 0, setHeader: () => undefined, end: (chunk?: string) => { body = chunk ?? ""; } },
    () => undefined,
  );
  return JSON.parse(body) as ReturnType<typeof manifestFor> extends Promise<infer T> ? T : never;
}

function withProject(run: (root: string, plugin: HostPlugin) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-no-framework-"));
    try {
      writeFileSync(join(root, "styles.css"), STYLESHEET);
      writeFileSync(join(root, "Card.tsx"), COMPONENT_SOURCE);
      await run(root, frameworkFreeHost(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

describe("the Vite host with no framework", () => {
  it("observes stylesheets and publishes tokens", withProject(async (_root, plugin) => {
    plugin.buildStart!();
    const code = (await plugin.load!("\0virtual:design-tokens"))!;
    expect(code).toContain("--brand");
    expect(code).toContain("--space");
  }));

  it("serves the inspector bootstrap", withProject((_root, plugin) => {
    const html = plugin.transformIndexHtml!("<html><body></body></html>");
    expect(html).toContain('id="nudge-ui-root"');
    expect(html).toContain("/__nudge_ui__/client.mjs");
  }));

  it("leaves source modules untouched, because interpreting them is a framework's job",
    withProject(async (root, plugin) => {
      const result = await plugin.transform!.handler(COMPONENT_SOURCE, join(root, "Card.tsx"));
      expect(result).toBeNull();
    }));

  it("asks nothing of module resolution", withProject((root, plugin) => {
    expect(plugin.config!({ root }, { command: "serve" })).toBeUndefined();
  }));

  it("serves no framework virtual module", withProject((_root, plugin) => {
    expect(plugin.resolveId!("virtual:nudge-ui-components")).toBeNull();
  }));

  it("bootstraps the demo runtime without importing a framework module", withProject(async (root) => {
    // SAFETY: the returned Vite plugin is exercised through the hooks declared above.
    const plugin = createVitePlugins({ demo: true }, null)[0] as unknown as HostPlugin;
    plugin.configResolved!({ root, command: "serve" });
    plugin.buildStart!();

    const bootstrap = (await plugin.load!("\0virtual:nudge-ui-inspector"))!;
    expect(bootstrap).not.toContain("virtual:nudge-ui-components");
    expect(bootstrap).toContain('host: "static-html"');
    expect(bootstrap).toContain("componentSemantics: false");
    expect(bootstrap).toContain("componentContracts: []");
  }));

  it("describes itself honestly rather than claiming component semantics it has no way to provide",
    withProject(async (root) => {
      const manifest = await manifestFor(createVitePlugins({}, null), root);
      expect(manifest.runtime).toMatchObject({
        host: "static-html",
        framework: "HTML",
        capabilities: { componentSemantics: false },
      });
      expect(manifest.runtime.componentContracts).toEqual([]);
    }));
});

describe("the same host composed with React", () => {
  it("does all of that and interprets source modules too", withProject(async (root) => {
    // SAFETY: the returned Vite plugin is exercised through the hooks declared above.
    const plugin = createVitePlugins({}, createReactSupport)[0] as unknown as HostPlugin;
    plugin.configResolved!({ root, command: "serve" });
    plugin.buildStart!();

    expect((await plugin.load!("\0virtual:design-tokens"))!).toContain("--brand");
    expect(plugin.resolveId!("virtual:nudge-ui-components")).toBe("\0virtual:nudge-ui-components");

    // React contributes the resolution policy the framework-free host omits.
    const config = plugin.config!({ root }, { command: "serve" }) as {
      resolve: { dedupe: string[] };
    };
    expect(config.resolve.dedupe).toEqual(expect.arrayContaining(["react", "react-dom"]));
  }));

  it("relabels the manifest and finds the component it was pointed at", withProject(async (root) => {
    const manifest = await manifestFor(createVitePlugins({}, createReactSupport), root);
    expect(manifest.runtime).toMatchObject({
      host: "vite-react",
      framework: "React",
      capabilities: { componentSemantics: true },
    });
    expect(manifest.runtime.componentContracts.map((contract) => contract.componentId))
      .toContain("Card#Card");
  }));
});
