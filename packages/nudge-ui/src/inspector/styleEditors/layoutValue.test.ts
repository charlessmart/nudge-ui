// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineAuthoredValue, readAuthoredStyleValue } from "./layoutValue.ts";
import { beginLayoutPreview, endLayoutPreview } from "./layoutPreviewState.ts";

describe("layout authored values", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("recovers a nested Grid expression from page CSS", () => {
    const style = document.createElement("style");
    style.textContent = `
      .grid-subject {
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        grid-template-rows: minmax(0, 1fr) auto;
      }
    `;
    document.head.appendChild(style);
    const subject = document.createElement("div");
    subject.className = "grid-subject";
    document.body.appendChild(subject);

    expect(readAuthoredStyleValue(subject, "grid-template-columns"))
      .toBe("repeat(auto-fit, minmax(12rem, 1fr))");
    expect(readAuthoredStyleValue(subject, "grid-template-rows"))
      .toBe("minmax(0, 1fr) auto");
  });

  it("uses the winning declaration when the same selector is repeated", () => {
    const style = document.createElement("style");
    style.textContent = `
      .grid-subject { grid-template-columns: 1fr; }
      .grid-subject { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    `;
    document.head.appendChild(style);
    const subject = document.createElement("div");
    subject.className = "grid-subject";
    document.body.appendChild(subject);

    expect(readAuthoredStyleValue(subject, "grid-template-columns"))
      .toBe("repeat(2, minmax(0, 1fr))");
  });

  it("recovers values from an active nested media rule without splitting quoted semicolons", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    try {
      const style = document.createElement("style");
      style.textContent = `
        .grid-subject {
          grid-template-columns: 1fr;
        }
        @media (min-width: 1px) {
          .grid-subject {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            grid-template-areas: "main; aside";
          }
        }
      `;
      document.head.appendChild(style);
      const subject = document.createElement("div");
      subject.className = "grid-subject";
      document.body.appendChild(subject);

      expect(readAuthoredStyleValue(subject, "grid-template-columns"))
        .toBe("repeat(3, minmax(0, 1fr))");
      expect(readAuthoredStyleValue(subject, "grid-template-areas"))
        .toBe('"main; aside"');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("projects an authored gap expression onto both gap axes", () => {
    const style = document.createElement("style");
    style.textContent = `
      .grid-subject {
        gap: clamp(48px, 8vw, 140px);
      }
    `;
    document.head.appendChild(style);
    const subject = document.createElement("div");
    subject.className = "grid-subject";
    document.body.appendChild(subject);

    expect(readAuthoredStyleValue(subject, "row-gap"))
      .toBe("clamp(48px, 8vw, 140px)");
    expect(readAuthoredStyleValue(subject, "column-gap"))
      .toBe("clamp(48px, 8vw, 140px)");
  });

  it("keeps separate authored row and column gap values", () => {
    const style = document.createElement("style");
    style.textContent = ".grid-subject { gap: 12px clamp(48px, 8vw, 140px); }";
    document.head.appendChild(style);
    const subject = document.createElement("div");
    subject.className = "grid-subject";
    document.body.appendChild(subject);

    expect(readAuthoredStyleValue(subject, "row-gap")).toBe("12px");
    expect(readAuthoredStyleValue(subject, "column-gap"))
      .toBe("clamp(48px, 8vw, 140px)");
  });
});

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
