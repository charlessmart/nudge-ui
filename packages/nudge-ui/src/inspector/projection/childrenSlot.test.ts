// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { childrenSlotInvocation } from "./childrenSlot.ts";
import { registerComponentRuntimeAdapter } from "../componentSemantics/adapterRegistry.ts";
import type { ComponentRootInvocation, RuntimeComponentTarget } from "../componentSemantics/types.ts";

function tagged(cid: string, src: string): HTMLDivElement {
  const element = document.createElement("div");
  element.dataset.cid = cid;
  element.dataset.src = src;
  return element;
}

function invocation(callsiteId: string, componentName: string): RuntimeComponentTarget {
  const [file, line, column] = callsiteId.split(":");
  return {
    framework: "react",
    meta: {
      callsiteId,
      componentId: `src/ui#${componentName}`,
      componentName,
      file: file!,
      line: Number(line),
      column: Number(column),
      authoredProps: {},
    },
    props: {},
  };
}

let unregister: (() => void) | null = null;

/** Every element answers with the same ancestry, nearest first. */
function runtime(targets: RuntimeComponentTarget[], roots: ComponentRootInvocation[] = []): void {
  unregister = registerComponentRuntimeAdapter({
    framework: "react",
    inspect: () => targets,
    replaceOverrides: () => undefined,
    rootInvocations: () => roots,
  });
}

afterEach(() => {
  unregister?.();
  unregister = null;
});

describe("childrenSlotInvocation", () => {
  it("names the invocation whose callsite authored the parent's children", () => {
    runtime([invocation("src/Page.tsx:12:5", "Stack"), invocation("src/App.tsx:3:1", "Page")]);
    const root = tagged("Stack", "src/ui/Stack.tsx:8:10");
    const child = tagged("Page", "src/Page.tsx:13:7");
    root.append(child);

    expect(childrenSlotInvocation(root, child)).toEqual({ callsiteId: "src/Page.tsx:12:5", componentName: "Stack" });
  });

  it("finds the slot's invocation when children render into an element inside the component", () => {
    runtime([invocation("src/Page.tsx:20:3", "Card"), invocation("src/Page.tsx:12:5", "Section")]);
    const inner = tagged("Card", "src/ui/Card.tsx:14:12");
    const child = tagged("Page", "src/Page.tsx:21:7");
    inner.append(child);

    expect(childrenSlotInvocation(inner, child)).toEqual({ callsiteId: "src/Page.tsx:20:3", componentName: "Card" });
  });

  it("ignores elements authored together with their children", () => {
    runtime([invocation("src/App.tsx:3:1", "Page")]);
    const list = tagged("Page", "src/Page.tsx:12:5");
    const child = tagged("Page", "src/Page.tsx:13:7");

    expect(childrenSlotInvocation(list, child)).toBeNull();
  });

  it("assumes an empty component root renders its children", () => {
    runtime([], [{ callsiteId: "src/Page.tsx:12:5", componentName: "Stack" }]);

    expect(childrenSlotInvocation(tagged("Stack", "src/ui/Stack.tsx:8:10"), null))
      .toEqual({ callsiteId: "src/Page.tsx:12:5", componentName: "Stack" });
  });

  it("leaves a root already tagged with its callsite alone, as when a library spreads props onto it", () => {
    runtime([], [{ callsiteId: "src/Page.tsx:12:5", componentName: "Stack" }]);

    expect(childrenSlotInvocation(tagged("Stack", "src/Page.tsx:12:5"), null)).toBeNull();
  });
});
