// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { componentContracts } from "virtual:nudge-ui-components";
import { registerComponentRuntimeAdapter } from "./adapterRegistry.ts";
import { resolveTextBinding } from "./textBinding.ts";
import type { ComponentRuntimeAdapter } from "./types.ts";

function boundary(meta: Record<string, unknown>, props: Record<string, unknown>) {
  const type = Object.assign(() => null, {
    [Symbol.for("nudge-ui.react-component-boundary")]: true,
  });
  return {
    type,
    memoizedProps: { meta, element: { props } },
  };
}

function fixture(
  text: string,
  props: Record<string, unknown>,
  componentName = "Button",
): HTMLElement {
  const element = document.createElement("button");
  element.setAttribute("data-cid", componentName);
  element.textContent = text;
  (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
    type: "button",
    return: boundary({
      callsiteId: "src/App.tsx:4:3",
      componentId: "src/ui/Button#Button",
      componentName,
      file: "src/App.tsx",
      line: 4,
      column: 3,
      authoredProps: { label: "literal" },
    }, props),
  };
  document.body.append(element);
  return element;
}

describe("resolveTextBinding", () => {
  beforeEach(() => {
    componentContracts.length = 0;
    document.body.replaceChildren();
  });

  it("resolves a unique matching label and preserves its component target", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [
        { name: "label", control: "text", options: [], optional: false },
        { name: "href", control: "text", options: [], optional: false },
      ],
    });
    const element = fixture("Save", { label: "Save", href: "Save" });
    const resolved = resolveTextBinding(element);
    expect(resolved).toMatchObject({
      binding: {
        kind: "component-prop",
        property: "label",
        target: { callsiteId: "src/App.tsx:4:3" },
      },
      before: "Save",
    });
    // A uniquely-mounted callsite always resolves to the safe source-site
    // scope and never offers a rendered-instance choice.
    expect(resolved).toMatchObject({ scope: "source-site" });
    expect((resolved as { scopeChoices?: unknown }).scopeChoices).toBeUndefined();
  });

  it("resolves runtime string children and rejects implementation-only props", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [
        { name: "children", control: "text", options: [], optional: false },
        { name: "href", control: "text", options: [], optional: false },
      ],
    });
    const element = fixture("Learn more", { children: "Learn more", href: "Learn more" });
    expect(resolveTextBinding(element)).toMatchObject({
      binding: { property: "children" },
    });

    const noMatch = fixture("Other", { href: "Other" });
    expect(resolveTextBinding(noMatch)).toMatchObject({ kind: "rejected", reason: "no-binding" });
  });

  it("exposes equal-priority candidates to the inline chooser", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "children", control: "text", options: [], optional: false }],
    });
    componentContracts.push({
      componentId: "src/ui/Other#Other",
      name: "Other",
      file: "src/ui/Other.tsx",
      provenance: "typescript",
      props: [{ name: "children", control: "text", options: [], optional: false }],
    });
    const element = fixture("Same", { children: "Same" });
    const first = (element as unknown as Record<string, unknown>)["__reactFiber$test"] as { return: unknown };
    const buttonBoundary = first.return;
    const otherBoundary = boundary({
      callsiteId: "src/Other.tsx:8:3",
      componentId: "src/ui/Other#Other",
      componentName: "Other",
      file: "src/Other.tsx",
      line: 8,
      column: 3,
      authoredProps: { children: "expression" },
    }, { children: "Same" });
    first.return = otherBoundary;
    (otherBoundary as { return?: unknown }).return = buttonBoundary;
    const resolved = resolveTextBinding(element);
    expect(resolved).toMatchObject({ bindingChoices: expect.any(Array) });
    if ("bindingChoices" in resolved) {
      expect((resolved.bindingChoices ?? []).map((choice) => choice.binding.target.callsiteId))
        .toEqual(expect.arrayContaining(["src/App.tsx:4:3", "src/Other.tsx:8:3"]));
    }
  });

  it("rejects a repeated callsite because a canonical override would affect both outputs", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const first = fixture("Same", { label: "Same" });
    const second = fixture("Same", { label: "Same" });
    first.setAttribute("data-cid", "Button");
    second.setAttribute("data-cid", "Button");

    expect(resolveTextBinding(first)).toMatchObject({
      kind: "rejected",
      reason: "ambiguous-binding",
    });
  });

  it("rejects when no identity-backed invocation root proves uniqueness", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const element = fixture("Unlocated", { label: "Unlocated" });
    element.removeAttribute("data-cid");

    expect(resolveTextBinding(element)).toMatchObject({
      kind: "rejected",
      reason: "ambiguous-binding",
    });
  });

  it("does not take over an application-owned contenteditable surface", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const element = fixture("Write here", { label: "Write here" });
    element.setAttribute("contenteditable", "true");

    expect(resolveTextBinding(element)).toMatchObject({
      kind: "rejected",
      reason: "no-binding",
    });
  });

  it("rejects rich descendant markup and non-visible text hosts", () => {
    const rich = document.createElement("p");
    rich.dataset.cid = "Copy";
    rich.dataset.src = "src/Copy.tsx:8:3";
    const strong = document.createElement("strong");
    strong.textContent = "Keep markup";
    rich.append(strong);
    document.body.append(rich);
    expect(resolveTextBinding(rich)).toMatchObject({ kind: "rejected", reason: "unsafe-target" });

    const script = document.createElement("script");
    script.dataset.cid = "Copy";
    script.dataset.src = "src/Copy.tsx:9:3";
    document.body.append(script);
    script.textContent = "not visible copy";
    expect(resolveTextBinding(script)).toMatchObject({ kind: "rejected", reason: "unsafe-target" });
  });

  it("rejects an unsafe semantic host before adapter matching", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const element = fixture("Do not edit", { label: "Do not edit" });
    const script = document.createElement("script");
    script.dataset.cid = "Button";
    script.textContent = JSON.stringify(element.textContent) + ";";
    (script as unknown as Record<string, unknown>)["__reactFiber$test"] =
      (element as unknown as Record<string, unknown>)["__reactFiber$test"];
    element.replaceWith(script);

    expect(resolveTextBinding(script)).toMatchObject({ kind: "rejected", reason: "unsafe-target" });
  });

  it("preserves nested semantic text when a component contract is confident", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const element = fixture("Keep markup", { label: "Keep markup" });
    element.innerHTML = "<strong>Keep markup</strong>";

    expect(resolveTextBinding(element)).toMatchObject({
      binding: { kind: "component-prop", property: "label" },
    });
  });

  it("accepts a semantic target supplied by an injected runtime adapter", () => {
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Label";
    element.textContent = "Adapter text";
    document.body.append(element);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => [{
        framework: "react",
        meta: {
          callsiteId: "custom/Label.tsx:2:1",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "custom/Label.tsx",
          line: 2,
          column: 1,
          authoredProps: { text: "literal" },
        },
        props: { text: "Adapter text" },
      }],
      replaceOverrides: () => undefined,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      expect(resolveTextBinding(element)).toMatchObject({
        binding: { kind: "component-prop", property: "text" },
      });
    } finally {
      unregister();
    }
  });

  it("rejects repeated semantic roots even when rendered identity is available", () => {
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const first = fixture("Same", { label: "Same" });
    const second = fixture("Same", { label: "Same" });
    first.dataset.src = "src/App.tsx:4:3";
    second.dataset.src = "src/App.tsx:4:3";

    expect(resolveTextBinding(first)).toMatchObject({ kind: "rejected", reason: "ambiguous-binding" });
  });

  it("resolves distinct repeated rendered roots using before-text evidence only", () => {
    const first = document.createElement("p");
    first.dataset.cid = "Copy";
    first.dataset.src = "src/Copy.tsx:8:3";
    first.textContent = "Copy A";
    const second = document.createElement("p");
    second.dataset.cid = "Copy";
    second.dataset.src = "src/Copy.tsx:8:3";
    second.textContent = "Copy B";
    document.body.append(first, second);

    expect(resolveTextBinding(first)).toMatchObject({
      binding: { kind: "rendered-text" },
      before: "Copy A",
    });
  });

  it("turns repeated expression output into an instance-scoped text binding", () => {
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Label";
    element.dataset.src = "src/App.tsx:12:5";
    element.textContent = "From item";
    const other = document.createElement("span");
    other.dataset.cid = "Label";
    other.dataset.src = "src/App.tsx:12:5";
    other.textContent = "Other item";
    document.body.append(element, other);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => [{
        framework: "react",
        meta: {
          callsiteId: "src/App.tsx:12:5",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "src/App.tsx",
          line: 12,
          column: 5,
          authoredProps: { text: "expression" },
        },
        props: { text: "From item" },
      }],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      expect(resolveTextBinding(element)).toMatchObject({
        binding: { kind: "rendered-text" },
        scope: "rendered-instance",
        renderedSource: {
          authoredAs: "expression",
          evidence: { callsiteId: "src/App.tsx:12:5", mountedCount: 2 },
        },
      });
    } finally {
      unregister();
    }
  });

  it("offers an explicit scope for repeated literal output", () => {
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Label";
    element.dataset.src = "src/App.tsx:12:5";
    element.textContent = "Repeated literal";
    const other = document.createElement("span");
    other.dataset.cid = "Label";
    other.dataset.src = "src/App.tsx:12:5";
    other.textContent = "Other literal";
    document.body.append(element, other);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: (root) => [{
        framework: "react",
        meta: {
          callsiteId: "src/App.tsx:12:5",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "src/App.tsx",
          line: 12,
          column: 5,
          authoredProps: { text: "literal" },
        },
        props: { text: root.textContent ?? "" },
      }],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      expect(resolveTextBinding(element)).toMatchObject({
        binding: { kind: "component-prop", property: "text" },
        scope: "rendered-instance",
        scopeChoices: ["rendered-instance", "source-site"],
      });
    } finally {
      unregister();
    }
  });

  it("uses element data-src for text inside an enclosing component invocation", () => {
    const element = document.createElement("p");
    element.dataset.cid = "Page";
    element.dataset.src = "src/Page.tsx:50:10";
    element.textContent = "Rendered copy";
    (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
      type: "p",
      return: boundary({
        callsiteId: "src/App.tsx:20:5",
        componentId: "src/Page#Page",
        componentName: "Page",
        file: "src/App.tsx",
        line: 20,
        column: 5,
        authoredProps: { children: "literal" },
      }, {}),
    };
    document.body.append(element);

    const resolved = resolveTextBinding(element);
    if ("kind" in resolved) throw new Error(resolved.message);
    expect(resolved.renderedSource).toMatchObject({
      file: "src/Page.tsx",
      line: 50,
      column: 10,
      component: "Page",
      authoredAs: "unknown",
    });
  });

  it("falls back for one direct-leaf rendered root", () => {
    const element = document.createElement("p");
    element.dataset.cid = "Copy";
    element.dataset.src = "src/Copy.tsx:8:3";
    element.dataset.cprops = "tone:muted";
    element.textContent = "Rendered copy";
    document.body.append(element);

    expect(resolveTextBinding(element)).toMatchObject({
      binding: { kind: "rendered-text" },
      before: "Rendered copy",
    });
  });

  it("resolves the direct text before a line break without flattening sibling markup", () => {
    const element = document.createElement("h2");
    element.dataset.cid = "App";
    element.dataset.src = "src/App.tsx:221:16";
    const leading = document.createTextNode("Everything here is");
    const lineBreak = document.createElement("br");
    const trailing = document.createElement("span");
    trailing.textContent = "selectable.";
    element.append(leading, lineBreak, trailing);
    document.body.append(element);

    const resolved = resolveTextBinding(element);

    expect(resolved).toMatchObject({
      binding: { kind: "rendered-text" },
      before: "Everything here is",
      textNode: leading,
    });
    expect(element.querySelector("br")).toBe(lineBreak);
    expect(element.querySelector("span")?.textContent).toBe("selectable.");
  });

  it("rejects duplicate direct-leaf rendered roots before fallback binding", () => {
    const first = document.createElement("p");
    first.dataset.cid = "Copy";
    first.dataset.src = "src/Copy.tsx:8:3";
    first.dataset.cprops = "tone:muted";
    first.textContent = "Rendered copy";
    const second = first.cloneNode(true) as HTMLElement;
    document.body.append(first, second);

    expect(resolveTextBinding(first)).toMatchObject({
      kind: "rejected",
      reason: "ambiguous-binding",
    });
  });
});
