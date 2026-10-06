// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cloneElement,
  createElement,
  createRef,
  forwardRef,
  Fragment,
  StrictMode,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { getManagedSheetText } from "../projection/managedStylesheet.ts";
import { makeComponentChange } from "../changes/_testUtils.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changes/types.ts";
import {
  applyHostDraftProjection,
  compileDraftProjection,
} from "../projection/draftProjection.ts";
import {
  getReactCallsiteMultiplicity,
  instrumentReactComponent,
  inspectReactComponentTargets,
  inspectReactRootInvocations,
  resetReactComponentRuntime,
  replaceReactComponentOverrides,
} from "./reactRuntime.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function applyTestDraftProjection(changes: readonly ChangeRecord[]): void {
  applyHostDraftProjection(compileDraftProjection({
    revision: 1,
    changes,
    structuralChanges: [],
  }));
}

describe("React component runtime adapter", () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetReactComponentRuntime();
    replaceReactComponentOverrides([]);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.getElementById("nudge-ui-styles")?.remove();
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

  it("passes clone-injected refs and props through an instrumented trigger", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const originalRef = createRef<HTMLButtonElement>();
    const positioningRef = createRef<HTMLButtonElement>();
    let clickCount = 0;
    const Button = forwardRef<HTMLButtonElement, Record<string, unknown>>(
      function Button(props, ref) {
        return createElement("button", { ...props, ref }, "Open");
      },
    );
    const meta = {
      callsiteId: "src/App.tsx:20:7",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 20,
      column: 7,
      authoredProps: {},
    };
    const trigger = instrumentReactComponent(
      createElement(Button, { ref: originalRef }) as ReactElement<Record<string, unknown>>,
      meta,
    ) as ReactElement<Record<string, unknown>>;
    const clonedTrigger = cloneElement(trigger, {
      ref: positioningRef,
      "aria-expanded": true,
      "data-floating-reference": "true",
      onClick: () => { clickCount += 1; },
    });

    act(() => root?.render(clonedTrigger));

    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    expect(originalRef.current).toBe(button);
    expect(positioningRef.current).toBe(button);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(button?.getAttribute("data-floating-reference")).toBe("true");
    act(() => button?.click());
    expect(clickCount).toBe(1);
    expect(inspectReactComponentTargets(button as HTMLButtonElement)[0]?.meta).toEqual(meta);

    act(() => replaceReactComponentOverrides([{
      framework: "react",
      callsiteId: meta.callsiteId,
      prop: "aria-expanded",
      value: false,
    }]));
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(originalRef.current).toBe(button);
    expect(positioningRef.current).toBe(button);

    act(() => root?.unmount());
    root = null;
    expect(originalRef.current).toBeNull();
    expect(positioningRef.current).toBeNull();
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
      [Symbol.for("nudge-ui.react-component-boundary")]: true,
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
      [Symbol.for("nudge-ui.react-component-boundary")]: true,
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

  it("does not rerender a semantic boundary when a CSS edit preserves its overrides", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    let renderCount = 0;
    const Button = (props: { variant?: string }): ReactElement => {
      renderCount += 1;
      return createElement("button", {
        "data-cid": "Button",
        "data-variant": props.variant,
      });
    };
    const meta = {
      callsiteId: "src/App.tsx:30:7",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 30,
      column: 7,
      authoredProps: { variant: "literal" as const },
    };
    const semanticChange = makeComponentChange({
      target: { callsiteId: meta.callsiteId },
      after: "secondary",
    });
    const cssChange: ElementChangeRecord = {
      cid: "Button",
      file: "src/App.tsx",
      line: 30,
      selector: '[data-cid="Button"]',
      property: "color",
      oldToken: null,
      newToken: null,
      rawValue: "red",
      source: { file: "src/App.tsx", line: 30, component: "Button" },
    };

    act(() => root?.render(instrumentReactComponent(
      createElement(Button, { variant: "primary" }),
      meta,
    )));
    const beforeProjection = renderCount;

    act(() => applyTestDraftProjection([semanticChange]));
    const afterSemanticProjection = renderCount;
    expect(afterSemanticProjection).toBeGreaterThan(beforeProjection);
    expect(host.querySelector("button")?.getAttribute("data-variant")).toBe("secondary");

    act(() => applyTestDraftProjection([semanticChange, cssChange]));

    expect(renderCount).toBe(afterSemanticProjection);
    expect(host.querySelector("button")?.getAttribute("data-variant")).toBe("secondary");
    expect(getManagedSheetText()).toContain("color: red;");
  });

  it("rerenders semantic boundaries when overrides are added, changed, or removed", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    let renderCount = 0;
    const Button = (props: { variant?: string; disabled?: boolean }): ReactElement => {
      renderCount += 1;
      return createElement("button", props);
    };
    const meta = {
      callsiteId: "src/App.tsx:31:7",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 31,
      column: 7,
      authoredProps: { variant: "literal" as const },
    };
    const variantOverride = {
      framework: "react" as const,
      callsiteId: meta.callsiteId,
      prop: "variant",
      value: "secondary" as const,
    };
    const disabledOverride = {
      framework: "react" as const,
      callsiteId: meta.callsiteId,
      prop: "disabled",
      value: true,
    };

    act(() => root?.render(instrumentReactComponent(
      createElement(Button, { variant: "primary" }),
      meta,
    )));
    const initialRenderCount = renderCount;
    const button = (): HTMLButtonElement => host.querySelector("button") as HTMLButtonElement;

    act(() => replaceReactComponentOverrides([variantOverride]));
    expect(renderCount).toBeGreaterThan(initialRenderCount);
    expect(button().getAttribute("variant")).toBe("secondary");

    const afterAddition = renderCount;
    act(() => replaceReactComponentOverrides([variantOverride, disabledOverride]));
    expect(renderCount).toBeGreaterThan(afterAddition);
    expect(button().disabled).toBe(true);

    const afterSecondAddition = renderCount;
    act(() => replaceReactComponentOverrides([{
      ...variantOverride,
      value: "primary" as const,
    }, disabledOverride]));
    expect(renderCount).toBeGreaterThan(afterSecondAddition);
    expect(button().getAttribute("variant")).toBe("primary");

    const afterChange = renderCount;
    act(() => replaceReactComponentOverrides([variantOverride]));
    expect(renderCount).toBeGreaterThan(afterChange);
    expect(button().disabled).toBe(false);

    const afterRemoval = renderCount;
    act(() => replaceReactComponentOverrides([]));
    expect(renderCount).toBeGreaterThan(afterRemoval);
    expect(button().getAttribute("variant")).toBe("primary");
  });

  describe("root invocations", () => {
    const metaAt = (componentName: string, line: number) => ({
      callsiteId: `src/App.tsx:${line}:7`,
      componentId: `src/App.tsx#${componentName}`,
      componentName,
      file: "src/App.tsx",
      line,
      column: 7,
      authoredProps: {},
    });

    function renderIntoHost(element: ReactElement): HTMLElement {
      const host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      act(() => root?.render(element));
      return host;
    }

    it("lists every invocation whose entire output is the element, nearest first", () => {
      const Toolbar = (): ReactElement => createElement("div", { id: "toolbar" }, createElement("span", { id: "tool" }));
      const Stage = (): ReactElement => instrumentReactComponent(createElement(Toolbar), metaAt("Toolbar", 20));
      const host = renderIntoHost(instrumentReactComponent(createElement(Stage), metaAt("Stage", 10)));

      expect(inspectReactRootInvocations(host.querySelector("#toolbar") as HTMLElement)).toEqual([
        { callsiteId: "src/App.tsx:20:7", componentName: "Toolbar" },
        { callsiteId: "src/App.tsx:10:7", componentName: "Stage" },
      ]);
    });

    it("returns no invocation for an element nested inside a component's output", () => {
      const Toolbar = (): ReactElement => createElement("div", null, createElement("span", { id: "tool" }));
      const host = renderIntoHost(instrumentReactComponent(createElement(Toolbar), metaAt("Toolbar", 20)));

      expect(inspectReactRootInvocations(host.querySelector("#tool") as HTMLElement)).toEqual([]);
    });

    it("excludes an invocation that renders more than one root", () => {
      const Pair = (): ReactElement => createElement(Fragment, null,
        createElement("div", { id: "first" }),
        createElement("div", { id: "second" }));
      const host = renderIntoHost(instrumentReactComponent(createElement(Pair), metaAt("Pair", 20)));

      expect(inspectReactRootInvocations(host.querySelector("#first") as HTMLElement)).toEqual([]);
    });

    it("returns null for an element React did not render", () => {
      expect(inspectReactRootInvocations(document.createElement("div"))).toBeNull();
    });
  });
});
