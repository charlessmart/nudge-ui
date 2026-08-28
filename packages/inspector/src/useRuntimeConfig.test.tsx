// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { act } from "react";
import { mount, type MountHandle } from "./styleEditors/_testUtils.ts";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  type NudgeUiRuntimeConfig,
} from "./runtimeConfig.ts";
import { useNudgeUiRuntimeConfig } from "./useRuntimeConfig.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeConfig(projectId: string): NudgeUiRuntimeConfig {
  return {
    projectId,
    host: "static-html",
    framework: "HTML",
    stylingSystem: "",
    capabilities: { canvas: false, componentSemantics: false },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  };
}

let previousConfig: NudgeUiRuntimeConfig | null = null;
let handle: MountHandle | undefined;

afterEach(() => {
  handle?.unmount();
  handle = undefined;
  if (previousConfig) configureNudgeUiRuntime(previousConfig);
  previousConfig = null;
});

describe("useNudgeUiRuntimeConfig", () => {
  it("re-renders the subscribed tree when the host replaces the configuration", () => {
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime(makeConfig("first-host"));

    let renderCount = 0;
    const Probe = (): ReactElement => {
      renderCount += 1;
      const config = useNudgeUiRuntimeConfig();
      return createElement("div", {}, config.projectId);
    };

    handle = mount(createElement(Probe));
    expect(handle.host.textContent).toBe("first-host");
    const rendersAfterMount = renderCount;

    act(() => {
      configureNudgeUiRuntime(makeConfig("second-host"));
    });

    expect(handle.host.textContent).toBe("second-host");
    expect(renderCount).toBeGreaterThan(rendersAfterMount);
  });
});
