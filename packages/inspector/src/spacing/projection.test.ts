// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { projectInspectorValues } from "./projection.ts";
import type { ResolvedProperty } from "@nudge-ui/css/model";

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
});
