// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  inspectReactComponentTargets,
  replaceReactComponentOverrides,
} from "./reactRuntime.tsx";

describe("React component runtime adapter", () => {
  beforeEach(() => replaceReactComponentOverrides([]));

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
