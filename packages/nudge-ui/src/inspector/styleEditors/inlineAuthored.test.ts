// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineAuthoredValue } from "./inlineAuthored.ts";
import { beginLayoutPreview, endLayoutPreview } from "./layoutPreviewState.ts";

describe("inline authored values", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reports a directly inline-authored property", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("column-gap", "16px");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "column-gap")).toBe("column-gap: 16px");
  });

  it("reports a longhand set through its shorthand", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("gap", "16px");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "column-gap")).toBe("gap: 16px");
    expect(inlineAuthoredValue(subject, "row-gap")).toBe("gap: 16px");
  });

  it("reports typography fields set through the font shorthand", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("font", "italic 700 24px/1.2 Inter");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "font-size")).toMatch(/^(font|font-size): /);
  });

  it("reports linked border fields when one side is inline-authored", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("border-top-style", "solid");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "border-style")).toBe("border-top-style: solid");
  });

  it("reports longhands expanded from their shorthand", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("margin", "0 auto");
    subject.style.setProperty("inset", "0");
    document.body.appendChild(subject);

    // jsdom expands margin but not inset (browsers expand both); either way
    // the longhand reports as inline-blocked.
    expect(inlineAuthoredValue(subject, "margin-top")).toBe("margin-top: 0px");
    expect(inlineAuthoredValue(subject, "left")).toBe("inset: 0");
  });

  it("returns null when nothing inline sets the property", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("display", "flex");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "column-gap")).toBeNull();
  });

  it("ignores shorthands that do not set the property", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("padding", "8px");
    document.body.appendChild(subject);

    expect(inlineAuthoredValue(subject, "column-gap")).toBeNull();
  });

  it("ignores a temporary canvas preview while it is active", () => {
    const subject = document.createElement("div");
    subject.style.setProperty("gap", "12px");
    document.body.appendChild(subject);

    beginLayoutPreview(subject, "row-gap");
    expect(inlineAuthoredValue(subject, "row-gap")).toBeNull();

    endLayoutPreview(subject, "row-gap");
    expect(inlineAuthoredValue(subject, "row-gap")).toBe("gap: 12px");
  });
});
