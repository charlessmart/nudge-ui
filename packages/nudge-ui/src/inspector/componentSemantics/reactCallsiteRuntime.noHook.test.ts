// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  inspectReactComponentTargets,
  registerReactCallsites,
  replaceReactComponentOverrides,
  resetReactComponentRuntime,
} from "./reactRuntime.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABEL = {
  callsiteId: "src/App.tsx:3:3",
  componentId: "src/ui#Label",
  componentName: "Label",
  file: "src/App.tsx",
  line: 3,
  column: 3,
  authoredProps: { tone: "literal" as const },
};

function Label({ tone }: { tone: string; [tag: `data-${string}`]: string }) {
  return createElement("span", null, tone);
}

describe("tagged React callsites without a DevTools hook", () => {
  afterEach(() => resetReactComponentRuntime());

  it("still names the component, counts it, and marks it prompt-only", () => {
    expect(Reflect.get(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__")).toBeUndefined();
    registerReactCallsites([LABEL]);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(Label, { tone: "info", "data-src": LABEL.callsiteId })));

    expect(inspectReactComponentTargets(host.querySelector("span") as HTMLElement)).toEqual([{
      framework: "react",
      meta: LABEL,
      props: { tone: "info" },
      mountedCount: 1,
      livePreview: false,
    }]);

    act(() => replaceReactComponentOverrides([
      { framework: "react", callsiteId: LABEL.callsiteId, prop: "tone", value: "critical" },
    ]));
    expect(host.textContent).toBe("info");
    act(() => root.unmount());
  });
});
