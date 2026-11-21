// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineAuthoredValue, inlineStyleSource } from "./inlineAuthored.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
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

    // jsdom expands margin but not inset (browsers expand both).
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

  describe("with style provenance", () => {
    const defaultConfig = getNudgeUiRuntimeConfig();

    afterEach(() => {
      configureNudgeUiRuntime(defaultConfig);
    });

    function inlineElement(provenance: object): HTMLElement {
      const subject = document.createElement("div");
      subject.style.setProperty("padding-left", "4px");
      subject.style.setProperty("color", "red");
      subject.style.setProperty("height", "67px");
      subject.setAttribute("data-cstyle", JSON.stringify(provenance));
      document.body.appendChild(subject);
      return subject;
    }

    it("leaves values written in source editable and reports where they live", () => {
      const subject = inlineElement({
        props: { "padding-inline": ["literal", "4", "paddingHorizontal"], color: ["expression", "colors.text", "color"] },
        opaque: [],
      });

      expect(inlineAuthoredValue(subject, "padding-left")).toBeNull();
      expect(inlineStyleSource(subject, "padding-left")).toEqual({ kind: "literal", property: "paddingHorizontal", source: "4" });
      expect(inlineStyleSource(subject, "color")).toEqual({ kind: "expression", property: "color", source: "colors.text" });
    });

    it("blocks values the source does not write", () => {
      const subject = inlineElement({ props: { color: ["expression", "colors.text", "color"] }, opaque: [] });

      expect(inlineAuthoredValue(subject, "height")).toBe("height: 67px");
      expect(inlineStyleSource(subject, "height")).toBeNull();
    });

    it("attributes unknown properties to an opaque style", () => {
      const subject = inlineElement({ props: {}, opaque: ["sizeStyle"] });

      expect(inlineAuthoredValue(subject, "height")).toBeNull();
      expect(inlineStyleSource(subject, "height")).toEqual({ kind: "opaque", source: "sizeStyle" });
    });

    it("keeps every inline value blocked on hosts without provenance", () => {
      configureNudgeUiRuntime({ ...defaultConfig, host: "static-html", framework: "HTML" });
      const subject = inlineElement({ props: { color: ["literal", "\"red\"", "color"] }, opaque: [] });

      expect(inlineAuthoredValue(subject, "color")).toBe("color: red");
      expect(inlineStyleSource(subject, "color")).toBeNull();
    });
  });
});
