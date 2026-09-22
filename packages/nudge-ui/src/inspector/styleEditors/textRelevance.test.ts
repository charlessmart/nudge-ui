// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getBrowserCssInspection, disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { isTextRelevant } from "./textRelevance.ts";

afterEach(() => {
  document.body.replaceChildren();
  disposeBrowserCssInspection(document);
});

describe("text relevance", () => {
  it.each([
    { html: "<p>Hello <strong>world</strong></p>", text: true },
    { html: '<input type="text">', text: true },
    { html: '<input type="checkbox">', text: false },
    { html: "<video>Video fallback text</video>", text: false },
    { html: '<img alt="Photo">', text: false },
    { html: "<div><p>A separate text element</p></div>", text: false },
    { html: '<div style="font-family: serif"><p>Styled by this container</p></div>', text: true },
    { html: '<button><span hidden>Hidden label</span><svg fill="currentColor"><path /></svg></button>', text: false },
  ])("shows relevant sections for $html", ({ html, text }) => {
    const parent = document.createElement("div");
    parent.style.fontFamily = "sans-serif";
    parent.style.color = "rgb(30, 60, 90)";
    parent.innerHTML = html;
    document.body.append(parent);
    const element = parent.firstElementChild as HTMLElement;
    const rows = getBrowserCssInspection().inspect(element).properties;
    expect(isTextRelevant(element, rows)).toBe(text);
  });
});
