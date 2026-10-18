import { describe, expect, it } from "vitest";
import { atRuleSegments } from "./atRuleSegments.ts";

const media = (params: string, active = false) => ({ kind: "media" as const, params, active });

describe("atRuleSegments", () => {
  it("orders desktop-first breakpoints from the base down and marks the base active when nothing wins", () => {
    const segments = atRuleSegments([media("(max-width: 600px)"), media("(max-width: 900px)")]);

    expect(segments.map((segment) => segment.params)).toEqual([null, "(max-width: 900px)", "(max-width: 600px)"]);
    expect(segments.map((segment) => segment.active)).toEqual([true, false, false]);
  });

  it("highlights the winning media query and not the base", () => {
    const segments = atRuleSegments([media("(max-width: 900px)"), media("(max-width: 600px)", true)]);

    expect(segments.map((segment) => segment.active)).toEqual([false, false, true]);
  });

  it("puts the base at the small end for mobile-first queries", () => {
    const segments = atRuleSegments([media("(min-width: 600px)"), media("(min-width: 900px)", true)]);

    expect(segments.map((segment) => segment.params)).toEqual(["(min-width: 900px)", "(min-width: 600px)", null]);
    expect(segments.map((segment) => segment.active)).toEqual([true, false, false]);
  });

  it("reads range syntax and rem units", () => {
    const segments = atRuleSegments([media("(width <= 37.5rem)"), media("(width < 900px)")]);

    expect(segments.map((segment) => segment.params)).toEqual([null, "(width < 900px)", "(width <= 37.5rem)"]);
  });

  it("keeps queries without a width bound after the measured ones in source order", () => {
    const segments = atRuleSegments([media("(prefers-color-scheme: dark)"), media("(max-width: 600px)"), media("print")]);

    expect(segments.map((segment) => segment.params)).toEqual([null, "(max-width: 600px)", "(prefers-color-scheme: dark)", "print"]);
  });

  it("treats a container or supports context as one segment after the base", () => {
    const segments = atRuleSegments([{ kind: "container", params: "(width > 100px)", active: true }]);

    expect(segments.map((segment) => [segment.kind, segment.active])).toEqual([["base", false], ["container", true]]);
  });
});
