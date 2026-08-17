// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getReactCallsiteMultiplicity,
  instrumentReactComponent,
  inspectReactComponentTargets,
  resetReactComponentRuntime,
  replaceReactComponentOverrides,
} from "./reactRuntime.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("React component runtime adapter", () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetReactComponentRuntime();
    replaceReactComponentOverrides([]);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    resetReactComponentRuntime();
  });

  it("tracks mounted callsite multiplicity across StrictMode, rerenders, and unmounts", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const meta = {
      callsiteId: "src/App.tsx:12:5",
      componentId: "src/ui/Label#Label",
      componentName: "Label",
      file: "src/App.tsx",
      line: 12,
      column: 5,
      authoredProps: { text: "expression" as const },
    };
    const item = (text: string) => instrumentReactComponent(
      createElement("span", null, text) as unknown as ReactElement<Record<string, unknown>>,
      meta,
    );

    act(() => {
      root?.render(createElement(StrictMode, null, createElement("div", null, item("A"), item("B"))));
    });
    expect(getReactCallsiteMultiplicity(meta.callsiteId)).toBe(2);
    const first = host.querySelector("span") as HTMLElement;
    expect(inspectReactComponentTargets(first)[0]?.mountedCount).toBe(2);

    act(() => {
      root?.render(createElement(StrictMode, null, item("A")));
    });
    expect(getReactCallsiteMultiplicity(meta.callsiteId)).toBe(1);

    act(() => root?.unmount());
    expect(getReactCallsiteMultiplicity(meta.callsiteId)).toBeNull();
    host.remove();
  });

  it("reads instrumented invocation ancestry from a host fiber", () => {
    const element = document.createElement("button");
    const meta = {
      callsiteId: "src/App.tsx:4:3",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 4,
      column: 3,
      authoredProps: { variant: "literal" as const },
    };
    const boundaryType = Object.assign(() => null, {
      [Symbol.for("design-tool.react-component-boundary")]: true,
    });
    (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
      type: "button",
      return: {
        type: boundaryType,
        memoizedProps: {
          meta,
          element: { props: { variant: "primary", label: "Save" } },
        },
      },
    };

    expect(inspectReactComponentTargets(element)).toEqual([{
      framework: "react",
      meta,
      props: { variant: "primary", label: "Save" },
    }]);
  });

  it("projects typed overrides into inspected props", () => {
    const element = document.createElement("button");
    const meta = {
      callsiteId: "src/App.tsx:4:3",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 4,
      column: 3,
      authoredProps: { disabled: "literal" as const },
    };
    const boundaryType = Object.assign(() => null, {
      [Symbol.for("design-tool.react-component-boundary")]: true,
    });
    (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
      return: {
        type: boundaryType,
        memoizedProps: {
          meta,
          element: { props: { disabled: false } },
        },
      },
    };

    replaceReactComponentOverrides([{
      framework: "react",
      callsiteId: meta.callsiteId,
      prop: "disabled",
      value: true,
    }]);

    expect(inspectReactComponentTargets(element)[0]?.props.disabled).toBe(true);
  });
});
