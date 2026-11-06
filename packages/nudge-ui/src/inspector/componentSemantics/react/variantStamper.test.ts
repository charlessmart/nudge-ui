// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "../../../hosts/reactRendererCapture.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../../runtime/runtimeConfig.ts";
import { registerReactCallsites, resetReactComponentRuntime } from "./runtime.tsx";
import type { ComponentInvocationMeta } from "../types.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => {
  new Function(REACT_RENDERER_CAPTURE_SCRIPT)();
  ({ createRoot } = await import("react-dom/client"));
});

const BUTTON: ComponentInvocationMeta = {
  callsiteId: "src/App.tsx:4:3",
  componentId: "src/ds/Button#Button",
  componentName: "Button",
  file: "src/App.tsx",
  line: 4,
  column: 3,
  authoredProps: {},
};

function Button({ variant, loading }: { variant?: string; loading?: boolean; "data-src"?: string }) {
  return createElement("button", { type: "button", "data-loading": String(loading) }, variant);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("variant marker stamping", () => {
  let root: Root;
  let host: HTMLElement;
  const baseline = getNudgeUiRuntimeConfig();

  beforeEach(() => {
    resetReactComponentRuntime();
    configureNudgeUiRuntime({
      ...baseline,
      capabilities: { ...baseline.capabilities, componentSemantics: true },
      componentContracts: [{
        componentId: BUTTON.componentId,
        name: "Button",
        file: "src/ds/Button.tsx",
        provenance: "typescript",
        props: [
          { name: "variant", control: "select", options: ["primary", "secondary"], optional: true },
          { name: "loading", control: "boolean", options: [], optional: true },
        ],
      }],
    });
    registerReactCallsites([BUTTON]);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetReactComponentRuntime();
    configureNudgeUiRuntime(baseline);
  });

  const button = (variant?: string, loading?: boolean) =>
    createElement(Button, { variant, loading, "data-src": BUTTON.callsiteId });

  it("stamps each invocation's root node from its current props and follows prop changes", async () => {
    act(() => root.render(createElement("div", null, button("primary"), button("secondary", true))));
    await flush();
    const [first, second] = [...host.querySelectorAll("button")];
    expect(first!.getAttribute("data-nudge-ui-variant")).toBe("Button.variant=primary");
    expect(second!.getAttribute("data-nudge-ui-variant")).toBe("Button.loading=true Button.variant=secondary");

    act(() => root.render(createElement("div", null, button("secondary"), button())));
    await flush();
    expect(first!.getAttribute("data-nudge-ui-variant")).toBe("Button.variant=secondary");
    expect(second!.hasAttribute("data-nudge-ui-variant")).toBe(false);
  });

  it("stamps nothing when the runtime has no component semantics", async () => {
    configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), capabilities: { ...baseline.capabilities, componentSemantics: false } });
    act(() => root.render(button("primary")));
    await flush();
    expect(host.querySelector("[data-nudge-ui-variant]")).toBeNull();
  });
});
