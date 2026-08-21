import { afterEach, describe, expect, it } from "vitest";
import {
  configureDesignToolRuntime,
  getDesignToolRuntimeConfig,
  subscribeDesignToolRuntime,
  type DesignToolRuntimeConfig,
} from "./runtimeConfig.ts";
import type { TokenCatalogDiagnostic, TokenDefinition } from "@design-tool/css/model";
import type { ComponentContract } from "./componentSemantics/types.ts";

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

  it("deep-clones and freezes nested host data without freezing caller inputs", () => {
    previousConfig = getDesignToolRuntimeConfig();
    const tokenCatalog: TokenDefinition[] = [{
      cssName: "--color-brand",
      name: "brand",
      declarations: [{
        id: "brand-declaration",
        order: 1,
        value: "#123456",
        source: "theme.css:1",
        important: false,
        context: {
          selector: ":root",
          wrappers: [{ kind: "layer", params: "theme" }],
        },
      }],
    }];
    const tokens = [{ name: "--color-brand", value: "#123456", source: "theme.css:1" }];
    const tokenDiagnostics: TokenCatalogDiagnostic[] = [{
      code: "stylesheet-parse-failed",
      message: "Unexpected token",
      module: "theme.css",
      exportName: "brand",
    }];
    const capabilities = { canvas: true, componentSemantics: false };
    const componentContracts: ComponentContract[] = [{
      componentId: "ui/Button",
      name: "Button",
      file: "src/Button.tsx",
      provenance: "typescript",
      props: [{
        name: "size",
        control: "select",
        options: ["sm", "lg"],
        optional: true,
      }],
    }];
    const input: DesignToolRuntimeConfig = {
      ...makeConfig("generation-deep"),
      capabilities,
      tokenCatalog,
      tokens,
      tokenDiagnostics,
      componentContracts,
    };

    configureDesignToolRuntime(input);

    const snapshot = getDesignToolRuntimeConfig();
    expect(snapshot).not.toBe(input);
    expect(snapshot.capabilities).not.toBe(capabilities);
    expect(snapshot.tokenCatalog).not.toBe(tokenCatalog);
    expect(snapshot.tokenCatalog[0]).not.toBe(tokenCatalog[0]);
    expect(snapshot.tokenCatalog[0]?.declarations).not.toBe(tokenCatalog[0]?.declarations);
    expect(snapshot.tokenCatalog[0]?.declarations[0]?.context).not.toBe(tokenCatalog[0]?.declarations[0]?.context);
    expect(snapshot.componentContracts[0]?.props).not.toBe(componentContracts[0]?.props);
    expect(snapshot.componentContracts[0]?.props[0]?.options).not.toBe(componentContracts[0]?.props[0]?.options);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true);
    expect(Object.isFrozen(snapshot.tokens[0])).toBe(true);
    expect(Object.isFrozen(snapshot.tokenCatalog[0])).toBe(true);
    expect(Object.isFrozen(snapshot.tokenCatalog[0]?.declarations)).toBe(true);
    expect(Object.isFrozen(snapshot.tokenCatalog[0]?.declarations[0]?.context)).toBe(true);
    expect(Object.isFrozen(snapshot.tokenCatalog[0]?.declarations[0]?.context.wrappers)).toBe(true);
    expect(Object.isFrozen(snapshot.tokenDiagnostics[0])).toBe(true);
    expect(Object.isFrozen(snapshot.componentContracts[0])).toBe(true);
    expect(Object.isFrozen(snapshot.componentContracts[0]?.props)).toBe(true);
    expect(Object.isFrozen(snapshot.componentContracts[0]?.props[0]?.options)).toBe(true);

    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(capabilities)).toBe(false);
    expect(Object.isFrozen(tokens[0])).toBe(false);
    expect(Object.isFrozen(tokenCatalog[0])).toBe(false);
    expect(Object.isFrozen(tokenCatalog[0]?.declarations)).toBe(false);
    expect(Object.isFrozen(tokenDiagnostics[0])).toBe(false);
    expect(Object.isFrozen(componentContracts[0]?.props)).toBe(false);
    expect(Object.isFrozen(componentContracts[0]?.props[0]?.options)).toBe(false);

    tokenCatalog[0]!.declarations[0]!.value = "#654321";
    componentContracts[0]!.props[0]!.options[0] = "xl";
    capabilities.canvas = false;
    expect(snapshot.tokenCatalog[0]?.declarations[0]?.value).toBe("#123456");
    expect(snapshot.componentContracts[0]?.props[0]?.options[0]).toBe("sm");
    expect(snapshot.capabilities.canvas).toBe(true);
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
