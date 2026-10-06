// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  instrumentReactComponent,
  resetReactComponentRuntime,
} from "../componentSemantics/reactRuntime.tsx";
import { generatePrompt } from "../prompt/generatePrompt.ts";
import { captureStructuralTarget, resolveRenderedInstance } from "./renderedInstance.ts";
import {
  applyStructuralProjection,
  createStructuralDelete,
  getStructuralChanges,
  resetStructuralDeleteProjection,
} from "./structuralProjection.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Toolbar(): ReactElement {
  return createElement(
    "div",
    { "data-cid": "Toolbar", "data-src": "src/Bento.tsx:160:5", "data-cprops": "className:toolbar" },
    createElement("span", { "data-cid": "Tool", "data-src": "src/Bento.tsx:161:7" }),
  );
}

function toolbarAt(line: number): ReactElement {
  return instrumentReactComponent(createElement(Toolbar) as ReactElement<Record<string, unknown>>, {
    callsiteId: `src/Bento.tsx:${line}:7`,
    componentId: "src/Bento.tsx#Toolbar",
    componentName: "Toolbar",
    file: "src/Bento.tsx",
    line,
    column: 7,
    authoredProps: {},
  });
}

function stages(...lines: number[]): ReactElement {
  return createElement("main", null, ...lines.map((line) => createElement("section", { key: line }, toolbarAt(line))));
}

function toolbars(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-cid="Toolbar"]'));
}

describe("structural delete of a shared component's root", () => {
  let root: Root | null = null;

  function render(element: ReactElement): void {
    if (!root) {
      const host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
    }
    act(() => root?.render(element));
  }

  beforeEach(() => {
    resetStructuralDeleteProjection();
    resetReactComponentRuntime();
    document.body.replaceChildren();
  });

  afterEach(() => {
    resetStructuralDeleteProjection();
    if (root) act(() => root?.unmount());
    root = null;
  });

  it("records the invocation and deletes only that copy", () => {
    render(stages(157, 207));
    const [first, second] = toolbars();

    const change = createStructuralDelete(second!, "delete-1")!;

    expect(change.target.locator.invocation).toEqual({ callsiteId: "src/Bento.tsx:207:7", componentName: "Toolbar" });
    expect(applyStructuralProjection(document, getStructuralChanges())).toEqual([{ changeId: "delete-1", status: "applied" }]);
    expect(first!.isConnected).toBe(true);
    expect(second!.isConnected).toBe(false);
  });

  it("tells the agent to remove the invocation", () => {
    render(stages(157, 207));
    const change = createStructuralDelete(toolbars()[1]!, "delete-1")!;

    expect(generatePrompt([], undefined, [change])).toContain(
      "- Remove the `<Toolbar>` invocation at src/Bento.tsx:207:7 from the source; keep its other invocations.",
    );
  });

  it("resolves missing only after the recorded invocation is removed", () => {
    render(stages(157, 207));
    const ref = captureStructuralTarget(toolbars()[1]!)!;

    render(stages(207));
    expect(resolveRenderedInstance(document, ref)).toMatchObject({ status: "resolved", element: toolbars()[0] });

    render(stages(157));
    expect(resolveRenderedInstance(document, ref)).toEqual({ status: "missing" });
  });

  it("keeps an element nested inside the shared output ambiguous", () => {
    render(stages(157, 207));
    const tool = toolbars()[1]!.querySelector<HTMLElement>('[data-cid="Tool"]')!;

    const change = createStructuralDelete(tool, "delete-1")!;

    expect(change.target.locator.invocation).toBeUndefined();
    expect(applyStructuralProjection(document, [change]))
      .toEqual([{ changeId: "delete-1", status: "ambiguous", reason: "target" }]);
  });

  it("reports ambiguous when no runtime can read a candidate's ancestry", () => {
    render(stages(157, 207));
    const ref = captureStructuralTarget(toolbars()[1]!)!;
    act(() => root?.unmount());
    root = null;
    const copy = document.createElement("div");
    copy.dataset.cid = "Toolbar";
    copy.dataset.src = "src/Bento.tsx:160:5";
    copy.dataset.cprops = "className:toolbar";
    document.body.append(copy);

    expect(resolveRenderedInstance(document, ref)).toEqual({ status: "ambiguous" });
  });
});
