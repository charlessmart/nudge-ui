import { afterEach, describe, expect, it } from "vitest";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  getScopingSelectorPattern,
  getSourceCoordinatePolicy,
  subscribeNudgeUiRuntime,
  type NudgeUiRuntimeConfig,
} from "./runtimeConfig.ts";
import type { TokenCatalogDiagnostic, TokenDefinition } from "@nudge-ui/css/model";
import type { ComponentContract } from "./componentSemantics/types.ts";

function makeConfig(tokenGeneration: string): NudgeUiRuntimeConfig {
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

let previousConfig: NudgeUiRuntimeConfig | null = null;

afterEach(() => {
  if (previousConfig) configureNudgeUiRuntime(previousConfig);
  previousConfig = null;
});

describe("Nudge UI runtime configuration", () => {
  it("publishes a defensive immutable snapshot", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const input = makeConfig("generation-1");

    configureNudgeUiRuntime(input);

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot).not.toBe(input);
    expect(snapshot).toMatchObject(input);
    expect(snapshot.tokens).not.toBe(input.tokens);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tokens)).toBe(true);
  });

  it("deep-clones and freezes nested host data without freezing caller inputs", () => {
    previousConfig = getNudgeUiRuntimeConfig();
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
    const input: NudgeUiRuntimeConfig = {
      ...makeConfig("generation-deep"),
      capabilities,
      tokenCatalog,
      tokens,
      tokenDiagnostics,
      componentContracts,
    };

    configureNudgeUiRuntime(input);

    const snapshot = getNudgeUiRuntimeConfig();
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
    previousConfig = getNudgeUiRuntimeConfig();
    const generations: string[] = [];
    const unsubscribe = subscribeNudgeUiRuntime(() => {
      generations.push(getNudgeUiRuntimeConfig().tokenGeneration);
    });

    configureNudgeUiRuntime(makeConfig("generation-1"));
    configureNudgeUiRuntime(makeConfig("generation-2"));
    unsubscribe();

    expect(generations).toEqual(["generation-1", "generation-2"]);
    expect(getNudgeUiRuntimeConfig().tokenGeneration).toBe("generation-2");
  });

  it("freezes and replaces host capabilities with the runtime snapshot", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const input = makeConfig("generation-capabilities");

    configureNudgeUiRuntime({
      ...input,
      capabilities: { canvas: false, componentSemantics: false },
    });

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot.capabilities).toEqual({ canvas: false, componentSemantics: false, domNavigation: false });
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true);
    expect(() => {
      (snapshot.capabilities as { canvas: boolean }).canvas = true;
    }).toThrow();
  });
});

describe("runtime configuration validation and defaults", () => {
  afterEach(() => {
    if (previousConfig) configureNudgeUiRuntime(previousConfig);
    previousConfig = null;
  });

  it("accepts the nextjs-react host and preserves it on the snapshot", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const input: NudgeUiRuntimeConfig = {
      ...makeConfig("generation-nextjs"),
      projectId: "nextjs:9f2a",
      host: "nextjs-react",
    };

    configureNudgeUiRuntime(input);

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot.host).toBe("nextjs-react");
    expect(snapshot.projectId).toBe("nextjs:9f2a");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("accepts the astro host and preserves it on the snapshot", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const input: NudgeUiRuntimeConfig = {
      ...makeConfig("generation-astro"),
      projectId: "astro-fixture",
      host: "astro",
      framework: "Astro",
      capabilities: { canvas: false, componentSemantics: false },
    };

    configureNudgeUiRuntime(input);

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot.host).toBe("astro");
    expect(snapshot.framework).toBe("Astro");
    expect(snapshot.projectId).toBe("astro-fixture");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("preserves host-declared source-coordinate policies and scoping grammar", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime({
      ...makeConfig("generation-capabilities"),
      capabilities: {
        canvas: false,
        componentSemantics: true,
        sourceCoordinates: {
          exactCidPrefixes: ["astro:"],
          exactFileExtensions: [".astro", ".html", ".htm"],
        },
        scopingSelectorPattern: "\\[data-astro-cid-[^\\]]*\\]",
      },
    });

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot.capabilities.sourceCoordinates).toEqual({
      exactCidPrefixes: ["astro:"],
      exactFileExtensions: [".astro", ".html", ".htm"],
    });
    expect(getSourceCoordinatePolicy()).toEqual({
      exactCidPrefixes: ["astro:"],
      exactFileExtensions: [".astro", ".html", ".htm"],
    });
    expect(getScopingSelectorPattern()?.source).toBe("\\[data-astro-cid-[^\\]]*\\]");
  });

  it("defaults to exact coordinates and no scoping grammar when the host declares none", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime(makeConfig("generation-default-capabilities"));

    expect(getSourceCoordinatePolicy()).toBeNull();
    expect(getScopingSelectorPattern()).toBeNull();
    expect(getNudgeUiRuntimeConfig().capabilities.domNavigation).toBe(false);
  });

  it("degrades an invalid scoping pattern to no stripping instead of throwing", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime({
      ...makeConfig("generation-invalid-pattern"),
      capabilities: { canvas: false, componentSemantics: false, scopingSelectorPattern: "([" },
    });

    expect(getScopingSelectorPattern()).toBeNull();
  });

  it("rejects malformed source-coordinate policies and scoping patterns", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const invalidPolicy = {
      ...makeConfig("generation-invalid-policy"),
      capabilities: {
        canvas: false,
        componentSemantics: false,
        sourceCoordinates: { exactCidPrefixes: [7] },
      },
    } as unknown as NudgeUiRuntimeConfig;
    expect(() => configureNudgeUiRuntime(invalidPolicy)).toThrow(TypeError);

    const invalidPattern = {
      ...makeConfig("generation-invalid-pattern-2"),
      capabilities: { canvas: false, componentSemantics: false, scopingSelectorPattern: "" },
    } as unknown as NudgeUiRuntimeConfig;
    expect(() => configureNudgeUiRuntime(invalidPattern)).toThrow(TypeError);
  });

  it("rejects missing or invalid required identity fields", () => {
    const missingProjectId = { ...makeConfig("generation-validation") } as Record<string, unknown>;
    delete missingProjectId.projectId;
    expect(() => configureNudgeUiRuntime(missingProjectId as unknown as NudgeUiRuntimeConfig))
      .toThrow(/"projectId"/);

    expect(() => configureNudgeUiRuntime({
      ...makeConfig("generation-validation"),
      host: "cloud" as NudgeUiRuntimeConfig["host"],
    })).toThrow(/"host"/);

    expect(() => configureNudgeUiRuntime({
      ...makeConfig("generation-validation"),
      framework: "Vue" as NudgeUiRuntimeConfig["framework"],
    })).toThrow(/"framework"/);
  });

  it("supplies safe defaults for absent optional fields", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const partial = {
      projectId: "minimal-host",
      host: "static-html",
      framework: "HTML",
    } as unknown as NudgeUiRuntimeConfig;

    configureNudgeUiRuntime(partial);

    const snapshot = getNudgeUiRuntimeConfig();
    expect(snapshot).toMatchObject({
      projectId: "minimal-host",
      host: "static-html",
      framework: "HTML",
      stylingSystem: "",
      capabilities: { canvas: false, componentSemantics: false, domNavigation: false },
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      tokenGeneration: "",
      componentContracts: [],
    });
    expect(Object.isFrozen(snapshot.tokenCatalog)).toBe(true);
  });

  it("rejects wrong-typed optional fields instead of defaulting them", () => {
    expect(() => configureNudgeUiRuntime({
      ...makeConfig("generation-types"),
      tokens: "not-an-array",
    } as unknown as NudgeUiRuntimeConfig)).toThrow(/"tokens" must be an array/);

    expect(() => configureNudgeUiRuntime({
      ...makeConfig("generation-types"),
      capabilities: { canvas: "yes" },
    } as unknown as NudgeUiRuntimeConfig)).toThrow(/"canvas" must be a boolean/);
  });

  it("reuses frozen input subtrees by reference across repeated configuration", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const sharedTokens = Object.freeze([
      { name: "--space-1", value: "4px", source: "theme.css:1" },
    ]);
    const frozenInput = Object.freeze({
      ...makeConfig("generation-frozen"),
      tokens: sharedTokens,
    });

    configureNudgeUiRuntime(frozenInput);
    const firstSnapshot = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime(frozenInput);
    const secondSnapshot = getNudgeUiRuntimeConfig();

    expect(secondSnapshot).not.toBe(firstSnapshot);
    expect(secondSnapshot.tokens).toBe(firstSnapshot.tokens);
    expect(firstSnapshot.tokens).toBe(sharedTokens);
  });
});
