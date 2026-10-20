// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { projectInspectorValues } from "./projection.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";

function row(
  property: string,
  authored: string,
  value: string,
  options: Partial<ResolvedProperty> = {},
): ResolvedProperty {
  return {
    property,
    tokenName: null,
    declaredValue: authored,
    authored,
    resolvedValue: value,
    confidence: "unknown",
    evidence: { reason: "spacing projection fixture" },
    ...options,
  };
}

describe("spacing projection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("projects shared and mixed axis values independently", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const result = projectInspectorValues(element, [
      row("padding-top", "8px", "8px"),
      row("padding-right", "16px", "16px"),
      row("padding-bottom", "8px", "8px"),
      row("padding-left", "16px", "16px"),
    ]);

    expect(result.spacing.padding.linked).toBe(false);
    expect(result.spacing.padding.axes.vertical.state).toBe("shared");
    expect(result.spacing.padding.axes.horizontal.state).toBe("shared");
    expect(result.spacing.padding.axes.horizontal.fields[0].value).toBe("16px");
  });

  it("does not link equal computed values when authored intent differs", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const result = projectInspectorValues(element, [
      row("padding-left", "var(--space-4)", "16px", {
        tokenName: "--space-4",
        sourceProperty: "padding-inline",
      }),
      row("padding-right", "16px", "16px", {
        sourceProperty: "padding-inline",
      }),
      row("padding-top", "0px", "0px"),
      row("padding-bottom", "0px", "0px"),
    ]);

    expect(result.spacing.padding.axes.horizontal.state).toBe("mixed");
    expect(result.spacing.padding.axes.horizontal.fields[1].tokenName).toBe("--space-4");
    expect(result.spacing.padding.axes.horizontal.fields[1].sourceProperty).toBe("padding-inline");
  });

  it("keeps all four sides linked when authored, token, and value facts match", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const result = projectInspectorValues(element, [
      row("margin-top", "var(--space-2)", "8px", { tokenName: "--space-2", sourceProperty: "margin" }),
      row("margin-right", "var(--space-2)", "8px", { tokenName: "--space-2", sourceProperty: "margin" }),
      row("margin-bottom", "var(--space-2)", "8px", { tokenName: "--space-2", sourceProperty: "margin" }),
      row("margin-left", "var(--space-2)", "8px", { tokenName: "--space-2", sourceProperty: "margin" }),
    ]);

    expect(result.spacing.margin.linked).toBe(true);
    expect(result.spacing.margin.axes.horizontal.state).toBe("shared");
    expect(result.spacing.margin.axes.vertical.state).toBe("shared");
  });

  it("projects unauthored inset sides as auto rather than the computed offset", () => {
    const element = document.createElement("div");
    element.style.left = "0";
    document.body.appendChild(element);
    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((target: Element) => {
      const base = original(target);
      return new Proxy(base, {
        get(object, key: string) {
          if (key === "getPropertyValue") {
            return (property: string) => ({ right: "107px", left: "0px", top: "4px" })[property] ?? "";
          }
          const value = Reflect.get(object, key);
          return typeof value === "function" ? value.bind(object) : value;
        },
      });
    }) as typeof getComputedStyle;
    try {
      const { inset } = projectInspectorValues(element, []).spacing;

      expect(inset.fields.right.value).toBe("auto");
      expect(inset.fields.right.authoredValue).toBe("auto");
      expect(inset.fields.top.value).toBe("auto");
      expect(inset.fields.left.authoredValue).toBe("0px");
      expect(inset.fields.left.value).toBe("0px");
      expect(inset.axes.horizontal.state).toBe("mixed");
    } finally {
      window.getComputedStyle = original;
    }
  });

  it("keeps authored inset tokens and percentages from rows", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const { inset } = projectInspectorValues(element, [
      row("top", "var(--space-2)", "8px", { tokenName: "--space-2" }),
      row("left", "50%", "60px"),
    ]).spacing;

    expect(inset.fields.top.tokenName).toBe("--space-2");
    expect(inset.fields.top.authoredValue).toBe("var(--space-2)");
    expect(inset.fields.left.authoredValue).toBe("50%");
    expect(inset.fields.bottom.value).toBe("auto");
  });
});
