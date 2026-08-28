import { afterEach, describe, expect, it } from "vitest";
import { componentContracts } from "./nudge-ui-components.ts";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
} from "../runtimeConfig.ts";
import type { NudgeUiRuntimeConfig } from "../runtimeConfig.ts";

let previousConfig: NudgeUiRuntimeConfig | null = null;

afterEach(() => {
  componentContracts.length = 0;
  if (previousConfig) configureNudgeUiRuntime(previousConfig);
  previousConfig = null;
});

describe("nudge-ui-components Vitest stub", () => {
  it("keeps the fixture mutable while updating an immutable runtime snapshot", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    const contract = {
      componentId: "src/Button.tsx#Button",
      name: "Button",
      file: "src/Button.tsx",
      provenance: "typescript" as const,
      props: [{ name: "label", control: "text" as const, options: [], optional: false }],
    };

    componentContracts.push(contract);

    const snapshot = getNudgeUiRuntimeConfig();
    expect(componentContracts).toEqual([contract]);
    expect(snapshot.componentContracts).toEqual([contract]);
    expect(snapshot.componentContracts).not.toBe(componentContracts);
    expect(Object.isFrozen(snapshot.componentContracts)).toBe(true);

    componentContracts.length = 0;

    expect(componentContracts).toEqual([]);
    expect(getNudgeUiRuntimeConfig().componentContracts).toEqual([]);
  });
});
