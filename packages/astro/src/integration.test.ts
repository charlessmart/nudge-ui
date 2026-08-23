import { describe, expect, it, vi } from "vitest";
import type { AstroIntegration } from "astro";
import { designToolAstro } from "./integration.ts";

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

describe("designToolAstro", () => {
  it("registers the shared vite plugin, context plugin, bootstrap, and middleware in dev", () => {
    const integration = designToolAstro({ projectId: "site" });
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "dev");

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const plugins = (
      updateConfig.mock.calls[0]?.[0] as { vite: { plugins: unknown[] } }
    ).vite.plugins;
    // Shared plugin + transformed-CSS observer + project-context provider.
    expect(plugins).toHaveLength(3);

    expect(injectScript).toHaveBeenCalledTimes(1);
    const [stage, content] = injectScript.mock.calls[0] as unknown as [string, string];
    expect(stage).toBe("page");
    // The entry primes plugin-react's refresh runtime, then loads the
    // bootstrap dynamically so priming cannot be hoisted away.
    expect(content).toContain('import("/@react-refresh")');
    expect(content).toContain('import("@design-tool/astro/bootstrap")');

    expect(addMiddleware).toHaveBeenCalledTimes(1);
    const registration = addMiddleware.mock.calls[0]?.[0] as {
      order?: string;
      entrypoint?: URL;
    };
    expect(registration.order).toBe("pre");
    expect(registration.entrypoint).toBeInstanceOf(URL);
    expect(registration.entrypoint?.pathname).toContain("middleware.ts");
  });

  it("registers nothing for build commands (ADR-0002)", () => {
    const integration = designToolAstro();
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "build");

    expect(updateConfig).not.toHaveBeenCalled();
    expect(injectScript).not.toHaveBeenCalled();
    expect(addMiddleware).not.toHaveBeenCalled();
  });

  it("registers nothing when disabled, even in dev", () => {
    const integration = designToolAstro({ enabled: false });
    const { addMiddleware, injectScript, updateConfig } =
      runConfigSetup(integration, "dev");

    expect(updateConfig).not.toHaveBeenCalled();
    expect(injectScript).not.toHaveBeenCalled();
    expect(addMiddleware).not.toHaveBeenCalled();
  });
});
