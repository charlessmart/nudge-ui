import { describe, expect, it, vi } from "vitest";
import type { AstroIntegration } from "astro";
import { nudgeUiAstro, withNudgeUi } from "./integration.ts";
import { createAstroRuntimeConfig } from "./astroRuntimeConfig.ts";

type ConfigSetupParameters = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:setup"]>
>[0];

interface SetupSpies {
  addMiddleware: ReturnType<typeof vi.fn>;
  injectScript: ReturnType<typeof vi.fn>;
  updateConfig: ReturnType<typeof vi.fn>;
}

function runConfigSetup(
  integration: AstroIntegration,
  command: ConfigSetupParameters["command"],
): SetupSpies {
  const updateConfig = vi.fn((newConfig: unknown) => newConfig);
  const injectScript = vi.fn();
  const addMiddleware = vi.fn();
  integration.hooks["astro:config:setup"]?.({
    command,
    updateConfig,
    injectScript,
    addMiddleware,
    isRestart: false,
  } as unknown as ConfigSetupParameters);
  return { updateConfig, injectScript, addMiddleware };
}

describe("nudgeUiAstro", () => {
  it("advertises iframe renderer support", () => {
    const runtime = createAstroRuntimeConfig({
      projectId: "site",
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      tokenGeneration: "astro-test",
      componentContracts: [],
    });

    expect(runtime.capabilities.canvas).toBe(true);
  });

  it("registers the shared vite plugin, context plugin, bootstrap, and middleware in dev", () => {
    const integration = nudgeUiAstro({ projectId: "site" });
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "dev");

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const plugins = (
      updateConfig.mock.calls[0]?.[0] as { vite: { plugins: unknown[] } }
    ).vite.plugins;
    // Client transport + shared plugin + transformed-CSS observer + context.
    expect(plugins).toHaveLength(4);
    expect((plugins[0] as { name?: string }).name).toBe("nudge-ui-astro-client-transport");

    expect(injectScript).toHaveBeenCalledTimes(1);
    const [stage, content] = injectScript.mock.calls[0] as unknown as [string, string];
    expect(stage).toBe("page");
    expect(content).toContain('/__nudge_ui__/client.mjs');
    expect(content).toContain('/__nudge_ui__/manifest');
    expect(content).toContain("data-nudge-ui-client");
    expect(content).not.toContain("../../inspector/index.ts");
    expect(content).not.toContain("@react-refresh");

    expect(addMiddleware).toHaveBeenCalledTimes(1);
    const registration = addMiddleware.mock.calls[0]?.[0] as {
      order?: string;
      entrypoint?: URL;
    };
    expect(registration.order).toBe("pre");
    expect(registration.entrypoint).toBeInstanceOf(URL);
    expect(registration.entrypoint?.pathname).toContain("middleware.ts");
  });

  it("serves the pure editor document from Astro's client transport", () => {
    const integration = nudgeUiAstro({ projectId: "site" });
    const { updateConfig } = runConfigSetup(integration, "dev");
    const plugins = (
      updateConfig.mock.calls[0]?.[0] as { vite: { plugins: Array<{ configureServer?(server: unknown): void }> } }
    ).vite.plugins;
    let middleware: ((request: { url: string; method: string; headers?: Record<string, string> }, response: {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(body?: string): void;
    }, next: () => void) => void) | undefined;
    plugins[0]?.configureServer?.({
      middlewares: { use: (handler: typeof middleware) => { middleware = handler; } },
    });
    let body = "";
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: (value = "") => { body = value; },
    };

    middleware?.({ url: "/__nudge_ui__/editor?url=%2Fabout", method: "GET" }, response, vi.fn());

    expect(response.statusCode).toBe(200);
    expect(body).toContain("data-nudge-ui-editor");
    expect(body).not.toContain("about");

    body = "";
    middleware?.({
      url: "/about?lang=en&nudge-ui=editor",
      method: "GET",
      headers: { accept: "text/html" },
    }, response, vi.fn());
    expect(body).toContain("data-nudge-ui-editor");
  });

  it("wraps arbitrary integration lists without mutating the input", () => {
    const existing = {
      integrations: [{ name: "docs", hooks: {} }],
      output: "static" as const,
    };
    const configured = withNudgeUi(existing, { projectId: "site" });

    expect(configured).not.toBe(existing);
    expect(existing.integrations).toHaveLength(1);
    expect(configured.integrations).toHaveLength(2);
    expect((configured.integrations as Array<{ name: string }>)[1]?.name).toBe("nudge-ui");
  });

  it("does not add a duplicate integration", () => {
    const integration = nudgeUiAstro();
    const config = { integrations: [integration] };
    expect(withNudgeUi(config)).toBe(config);
  });

  it("registers nothing for build commands (ADR-0002)", () => {
    const integration = nudgeUiAstro();
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "build");

    expect(updateConfig).not.toHaveBeenCalled();
    expect(injectScript).not.toHaveBeenCalled();
    expect(addMiddleware).not.toHaveBeenCalled();
  });

  it("registers nothing when disabled, even in dev", () => {
    const integration = nudgeUiAstro({ enabled: false });
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "dev");

    expect(updateConfig).not.toHaveBeenCalled();
    expect(injectScript).not.toHaveBeenCalled();
    expect(addMiddleware).not.toHaveBeenCalled();
  });
});
