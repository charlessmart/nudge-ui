// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, forwardRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { dropTargetLabel } from "./dropGuide.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function render(node: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

// Mirrors the design system: Stack renders Box, which renders the host element, and both set a displayName.
const Box = forwardRef<HTMLDivElement, { children?: ReactNode; testId: string }>(({ children, testId }, ref) =>
  createElement("div", { ref, "data-test": testId }, children));
Box.displayName = "Box";
const Stack = forwardRef<HTMLDivElement, { children?: ReactNode }>(({ children }, ref) =>
  createElement(Box, { ref, testId: "stack" }, children));
Stack.displayName = "Stack";

function VoicePanel(): ReactNode {
  return createElement("section", { "data-test": "panel" }, createElement(Stack, null, createElement("p", { "data-test": "bare" }, "Text")));
}

describe("dropTargetLabel", () => {
  it("names a design-system layout by its outermost displayName", () => {
    const container = render(createElement(VoicePanel));
    expect(dropTargetLabel(container.querySelector('[data-test="stack"]')!)).toBe("Into Stack");
  });

  it("falls back to the function name of the component whose root it is", () => {
    const container = render(createElement(VoicePanel));
    expect(dropTargetLabel(container.querySelector('[data-test="panel"]')!)).toBe("Into VoicePanel");
  });

  it("uses the tag for an element no component renders as its root", () => {
    const container = render(createElement(VoicePanel));
    expect(dropTargetLabel(container.querySelector('[data-test="bare"]')!)).toBe("Into p");
  });

  it("uses the tag outside React", () => {
    const element = document.createElement("ul");
    document.body.append(element);
    expect(dropTargetLabel(element)).toBe("Into ul");
  });
});
