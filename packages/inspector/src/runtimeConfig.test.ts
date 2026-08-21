import { afterEach, describe, expect, it } from "vitest";
import {
  configureDesignToolRuntime,
  getDesignToolRuntimeConfig,
  subscribeDesignToolRuntime,
  type DesignToolRuntimeConfig,
} from "./runtimeConfig.ts";

function makeConfig(tokenGeneration: string): DesignToolRuntimeConfig {
  return {
    projectId: "fixture-project",
    host: "vite-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: true },
    tokenCatalog: [],
    tokens: [{ name: "--space-1", value: "4px", source: "theme.css:1" }],
    tokenDiagnostics: [],
    tokenGeneration,
    componentContracts: [],
  };
}

let previousConfig: DesignToolRuntimeConfig | null = null;

afterEach(() => {
  if (previousConfig) configureDesignToolRuntime(previousConfig);
  previousConfig = null;
});

describe("Design Tool runtime configuration", () => {
  it("publishes a defensive immutable snapshot", () => {
    previousConfig = getDesignToolRuntimeConfig();
    const input = makeConfig("generation-1");

    configureDesignToolRuntime(input);

    const snapshot = getDesignToolRuntimeConfig();
    expect(snapshot).not.toBe(input);
    expect(snapshot).toMatchObject(input);
    expect(snapshot.tokens).not.toBe(input.tokens);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tokens)).toBe(true);
  });

  it("replaces the snapshot and notifies subscribers for host refreshes", () => {
    previousConfig = getDesignToolRuntimeConfig();
    const generations: string[] = [];
    const unsubscribe = subscribeDesignToolRuntime(() => {
      generations.push(getDesignToolRuntimeConfig().tokenGeneration);
    });

    configureDesignToolRuntime(makeConfig("generation-1"));
    configureDesignToolRuntime(makeConfig("generation-2"));
    unsubscribe();

    expect(generations).toEqual(["generation-1", "generation-2"]);
    expect(getDesignToolRuntimeConfig().tokenGeneration).toBe("generation-2");
  });

  it("freezes and replaces host capabilities with the runtime snapshot", () => {
    previousConfig = getDesignToolRuntimeConfig();
    const input = makeConfig("generation-capabilities");

    configureDesignToolRuntime({
      ...input,
      capabilities: { canvas: false, componentSemantics: false },
    });

    const snapshot = getDesignToolRuntimeConfig();
    expect(snapshot.capabilities).toEqual({ canvas: false, componentSemantics: false });
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true);
    expect(() => {
      (snapshot.capabilities as { canvas: boolean }).canvas = true;
    }).toThrow();
  });
});
