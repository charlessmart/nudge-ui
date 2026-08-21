import { afterEach, describe, expect, it } from "vitest";
import { componentContracts } from "./design-tool-components.ts";
import {
  configureDesignToolRuntime,
  getDesignToolRuntimeConfig,
} from "../runtimeConfig.ts";
import type { DesignToolRuntimeConfig } from "../runtimeConfig.ts";

let previousConfig: DesignToolRuntimeConfig | null = null;

afterEach(() => {
  componentContracts.length = 0;
  if (previousConfig) configureDesignToolRuntime(previousConfig);
  previousConfig = null;
});

describe("design-tool-components Vitest stub", () => {
  it("keeps the fixture mutable while updating an immutable runtime snapshot", () => {
    previousConfig = getDesignToolRuntimeConfig();
    const contract = {
      componentId: "src/Button.tsx#Button",
      name: "Button",
      file: "src/Button.tsx",
      provenance: "typescript" as const,
      props: [{ name: "label", control: "text" as const, options: [], optional: false }],
    };

    componentContracts.push(contract);

    const snapshot = getDesignToolRuntimeConfig();
    expect(componentContracts).toEqual([contract]);
    expect(snapshot.componentContracts).toEqual([contract]);
    expect(snapshot.componentContracts).not.toBe(componentContracts);
    expect(Object.isFrozen(snapshot.componentContracts)).toBe(true);

    componentContracts.length = 0;

    expect(componentContracts).toEqual([]);
    expect(getDesignToolRuntimeConfig().componentContracts).toEqual([]);
  });
});
