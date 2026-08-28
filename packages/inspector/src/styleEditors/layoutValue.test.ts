// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAuthoredStyleValue } from "./layoutValue.ts";

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
