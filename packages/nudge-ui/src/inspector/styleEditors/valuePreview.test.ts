// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { startValuePreview } from "./valuePreview.ts";
import { collectRules, invalidateStyleResolutionCache } from "../tokens/resolution/cssomCollector.ts";

function previewSheet(): string {
  const style = document.getElementById("nudge-ui-value-preview") as HTMLStyleElement | null;
  return style?.sheet ? Array.from(style.sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
}

describe("startValuePreview", () => {
  const stops: (() => void)[] = [];
  const preview = (...args: Parameters<typeof startValuePreview>) => {
    const stop = startValuePreview(...args);
    stops.push(stop);
    return stop;
  };

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("paints the value on every element without touching inline styles", () => {
    document.body.innerHTML = '<p id="a" style="color: red">A</p><p id="b">B</p>';
    const elements = Array.from(document.querySelectorAll<HTMLElement>("p"));

    const stop = preview(elements, "font-family", '"Helvetica Neue"');

    expect(previewSheet()).toContain('font-family: "Helvetica Neue" !important');
    expect(elements.every((element) => element.hasAttribute("data-nudge-ui-value-preview"))).toBe(true);
    expect(elements[0]?.getAttribute("style")).toBe("color: red");

    stop();
    expect(document.getElementById("nudge-ui-value-preview")).toBeNull();
    expect(elements.some((element) => element.hasAttribute("data-nudge-ui-value-preview"))).toBe(false);
  });

  it("replaces the previous preview, and a stale stop leaves the new one in place", () => {
    document.body.innerHTML = '<p id="a">A</p><p id="b">B</p>';
    const [first, second] = Array.from(document.querySelectorAll<HTMLElement>("p"));

    const stopFirst = preview([first!], "font-family", "Georgia");
    preview([second!], "font-family", "Avenir");
    stopFirst();

    expect(first!.hasAttribute("data-nudge-ui-value-preview")).toBe(false);
    expect(second!.hasAttribute("data-nudge-ui-value-preview")).toBe(true);
    expect(document.querySelectorAll("#nudge-ui-value-preview")).toHaveLength(1);
    expect(previewSheet()).toContain("font-family: Avenir !important");
  });

  it("stays out of inspected rules", () => {
    document.head.innerHTML = "<style>p { font-family: Inter; }</style>";
    document.body.innerHTML = "<p>A</p>";
    preview([document.querySelector("p")!], "font-family", "Georgia");
    invalidateStyleResolutionCache(document);

    const declarations = collectRules(document).rules.flatMap((rule) => rule.declarations.map((declaration) => declaration.value));
    expect(declarations).toEqual(["Inter"]);
  });
});
