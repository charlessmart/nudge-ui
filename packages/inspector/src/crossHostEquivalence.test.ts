// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  type NudgeUiRuntimeConfig,
} from "./runtimeConfig.ts";
import { storageKey } from "./canvas/sessionStore.ts";

/**
 * Cross-host equivalence (ADR-0010 verification strategy): one logical
 * runtime-config fixture configured under each host must produce equivalent
 * inspector behavior. The hosts differ ONLY in transport and identity
 * labels — validation, prompt naming, and storage namespacing are shared
 * Modules and must behave identically.
 */

type Host = NudgeUiRuntimeConfig["host"];

const HOSTS: Host[] = ["vite-react", "static-html", "nextjs-react", "astro"];

const PROJECT_IDS: Record<Host, string> = {
  "vite-react": "fixture-project",
  "static-html": "static-html:standalone-fixture",
  "nextjs-react": "nextjs:9f2ab4c1",
  astro: "astro-fixture",
};

function fixtureFor(host: Host): NudgeUiRuntimeConfig {
  return {
    projectId: PROJECT_IDS[host],
    host,
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: false, componentSemantics: false },
    tokenCatalog: [],
    tokens: [{ name: "--shared-token", value: "4px", source: "shared.css:1" }],
    tokenDiagnostics: [],
    tokenGeneration: "generation-equivalence",
    componentContracts: [],
  };
}

let previousConfig: NudgeUiRuntimeConfig | null = null;

afterEach(() => {
  if (previousConfig) configureNudgeUiRuntime(previousConfig);
  previousConfig = null;
});

describe("cross-host runtime equivalence", () => {
  it("validates the same fixture under every supported host", () => {
    for (const host of HOSTS) {
      previousConfig = getNudgeUiRuntimeConfig();
      expect(() => configureNudgeUiRuntime(fixtureFor(host))).not.toThrow();
      const snapshot = getNudgeUiRuntimeConfig();
      expect(snapshot.host).toBe(host);
      expect(snapshot.tokenGeneration).toBe("generation-equivalence");
      expect(Object.isFrozen(snapshot)).toBe(true);
    }
  });

  it("produces identical snapshots except for the identity fields", () => {
    const snapshots = HOSTS.map((host) => {
      configureNudgeUiRuntime(fixtureFor(host));
      return getNudgeUiRuntimeConfig();
    });
    const [vite, staticHtml, nextjs, astro] = snapshots as [
      NudgeUiRuntimeConfig,
      NudgeUiRuntimeConfig,
      NudgeUiRuntimeConfig,
      NudgeUiRuntimeConfig,
    ];

    // Everything except host/projectId is byte-identical across hosts.
    const stripIdentity = (s: NudgeUiRuntimeConfig) =>
      JSON.stringify({ ...s, host: null, projectId: null });
    expect(stripIdentity(staticHtml)).toBe(stripIdentity(vite));
    expect(stripIdentity(nextjs)).toBe(stripIdentity(vite));
    expect(stripIdentity(astro)).toBe(stripIdentity(vite));
  });

  it("namespaces durable storage per host without collisions", () => {
    const keys = HOSTS.map((host) => storageKey(PROJECT_IDS[host]));
    expect(new Set(keys).size).toBe(HOSTS.length);
  });
});
