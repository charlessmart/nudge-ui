import { describe, expect, it, vi } from "vitest";
import type { AstroIntegration } from "astro";
import { nudgeUiAstro } from "./integration.ts";

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
  it("registers the shared vite plugin, context plugin, bootstrap, and middleware in dev", () => {
    const integration = nudgeUiAstro({ projectId: "site" });
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
    // The refresh baseline is installed synchronously — before the dynamic
    // imports — so the inspector graph (loaded via the dynamic bootstrap
    // import, whose continuation always runs after this script's body) can
    // never evaluate against a missing `$RefreshReg$`.
    expect(content.indexOf("window.$RefreshReg$ = () => {};"))
      .toBeLessThan(content.indexOf('import("/@react-refresh")'));
    expect(content.indexOf("window.$RefreshReg$ = () => {};"))
      .toBeLessThan(content.indexOf('import("@nudge-ui/astro/bootstrap")'));
    expect(content).toContain("window.$RefreshSig$ = () => (type) => type;");
    expect(content).toContain("window.__vite_plugin_react_preamble_installed__ = true;");
    expect(content).toContain('import("/@react-refresh")');
    // The bootstrap loads dynamically so the synchronous baseline cannot be
    // hoisted away (ESM semantics), and does not wait on the refresh chain.
    expect(content).toContain('import("@nudge-ui/astro/bootstrap")');

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
