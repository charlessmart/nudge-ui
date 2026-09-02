// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitGridAxisPlacement,
  commitGridChildAlignment,
  commitGridChildQuickAction,
  parentTrackCount,
  parseSpanToken,
  readGridAxisPlacement,
  readGridChildAlignment,
  readGridChildQuickActionState,
  startLineOptions,
} from "./gridChildModel.ts";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
} from "./_testUtils.ts";

describe("gridChildModel", () => {
  beforeEach(() => {
    resetPendingRules();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    restoreComputedStyle();
    resetPendingRules();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  describe("parseSpanToken", () => {
    it("parses span tokens case-insensitively", () => {
      expect(parseSpanToken("span 3")).toBe(3);
      expect(parseSpanToken("SPAN 2")).toBe(2);
    });

    it("returns null for non-span values", () => {
      expect(parseSpanToken("auto")).toBeNull();
      expect(parseSpanToken("4")).toBeNull();
      expect(parseSpanToken("-1")).toBeNull();
      expect(parseSpanToken("content-end")).toBeNull();
    });
  });

  describe("readGridAxisPlacement", () => {
    it("reads an auto-placed axis", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "auto",
        "grid-column-end": "auto",
      });

      expect(readGridAxisPlacement(el, "column")).toEqual({ start: "auto", span: null, toLast: false });
    });

    it("derives the span from a span end token", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "2",
        "grid-column-end": "span 2",
      });

      expect(readGridAxisPlacement(el, "column")).toEqual({ start: "2", span: 2, toLast: false });
    });

    it("derives the span from definite start and end lines", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "2",
        "grid-column-end": "4",
      });

      expect(readGridAxisPlacement(el, "column")).toEqual({ start: "2", span: 2, toLast: false });
    });

    it("marks only the last line (-1) as to-last", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "1",
        "grid-column-end": "-1",
      });

      expect(readGridAxisPlacement(el, "column")).toEqual({ start: "1", span: null, toLast: true });
    });

    it("treats earlier negative end lines as neither span nor to-last", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "1",
        "grid-column-end": "-2",
      });

      expect(readGridAxisPlacement(el, "column")).toEqual({ start: "1", span: null, toLast: false });
    });

    it("keeps named line tokens as-authored", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-row-start": "sidebar",
        "grid-row-end": "span 2",
      });

      expect(readGridAxisPlacement(el, "row")).toEqual({ start: "sidebar", span: 2, toLast: false });
    });

    it("treats an empty computed readout as auto", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      expect(readGridAxisPlacement(el, "row")).toEqual({ start: "auto", span: null, toLast: false });
    });
  });

  describe("commitGridAxisPlacement", () => {
    it("skips rewriting an end side that already equals the derived span", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "2",
        "grid-column-end": "span 2",
      });

      commitGridAxisPlacement(el, "column", { start: "3", span: "keep" });

      expect(sheetText()).toContain("grid-column-start: 3;");
      expect(sheetText()).not.toContain("grid-column-end:");
    });

    it("writes the span longhand without touching the start", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "2",
        "grid-column-end": "auto",
      });

      commitGridAxisPlacement(el, "column", { span: 3 });

      expect(sheetText()).not.toContain("grid-column-start:");
      expect(sheetText()).toContain("grid-column-end: span 3;");
    });

    it("commits span 1 as an auto end", () => {
      const { el } = makeSelected();
      mockComputedStyle({ "grid-row-end": "span 2" });

      commitGridAxisPlacement(el, "row", { span: 1 });

      expect(sheetText()).toContain("grid-row-end: auto;");
    });

    it("keeps a negative end line untouched when only the start moves", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "1",
        "grid-column-end": "-1",
      });

      commitGridAxisPlacement(el, "column", { start: "2", span: "keep" });

      expect(sheetText()).toContain("grid-column-start: 2;");
      expect(sheetText()).not.toContain("grid-column-end:");
    });

    it("normalizes a definite end pair into a span when the start moves", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "2",
        "grid-column-end": "4",
      });

      commitGridAxisPlacement(el, "column", { start: "3", span: "keep" });

      expect(sheetText()).toContain("grid-column-start: 3;");
      expect(sheetText()).toContain("grid-column-end: span 2;");
    });

    it("writes nothing for an empty commit", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      expect(commitGridAxisPlacement(el, "column", {})).toEqual([]);
      expect(sheetText()).toBe("");
    });
  });

  describe("readGridChildAlignment", () => {
    it("maps normal to stretch: on grid items normal has stretch behavior", () => {
      const { el } = makeSelected();
      mockComputedStyle({ "justify-self": "normal", "align-self": "normal" });

      expect(readGridChildAlignment(el, "h")).toBe("stretch");
      expect(readGridChildAlignment(el, "v")).toBe("stretch");
    });

    it("keeps auto distinct so Parent default only means auto", () => {
      const { el } = makeSelected();
      mockComputedStyle({ "justify-self": "auto", "align-self": "auto" });

      expect(readGridChildAlignment(el, "h")).toBe("auto");
      expect(readGridChildAlignment(el, "v")).toBe("auto");
    });

    it("returns explicit alignment tokens verbatim", () => {
      const { el } = makeSelected();
      mockComputedStyle({ "justify-self": "center", "align-self": "self-start" });

      expect(readGridChildAlignment(el, "h")).toBe("center");
      expect(readGridChildAlignment(el, "v")).toBe("self-start");
    });
  });

  describe("commitGridChildAlignment", () => {
    it("writes the self-alignment longhand", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildAlignment(el, "h", "center");

      expect(sheetText()).toContain("justify-self: center;");
    });

    it("writes auto for parent default", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildAlignment(el, "v", "auto");

      expect(sheetText()).toContain("align-self: auto;");
    });
  });

  describe("commitGridChildQuickAction", () => {
    it("full width commits the column shorthand spanning all tracks", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildQuickAction(el, "full-width");

      expect(sheetText()).toContain("grid-column: 1 / -1;");
    });

    it("full height commits the row shorthand spanning all tracks", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildQuickAction(el, "full-height");

      expect(sheetText()).toContain("grid-row: 1 / -1;");
    });

    it("center commits both self-alignments", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildQuickAction(el, "center");

      expect(sheetText()).toContain("justify-self: center;");
      expect(sheetText()).toContain("align-self: center;");
    });

    it("fill commits stretch on both axes", () => {
      const { el } = makeSelected();
      mockComputedStyle({});

      commitGridChildQuickAction(el, "fill");

      expect(sheetText()).toContain("justify-self: stretch;");
      expect(sheetText()).toContain("align-self: stretch;");
    });
  });

  describe("readGridChildQuickActionState", () => {
    it("detects full width, centered, and filled states", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "1",
        "grid-column-end": "-1",
        "grid-row-start": "auto",
        "grid-row-end": "auto",
        "justify-self": "center",
        "align-self": "center",
      });

      expect(readGridChildQuickActionState(el)).toEqual({
        fullWidth: true,
        fullHeight: false,
        centered: true,
        filled: false,
      });
    });

    it("does not treat flow-placed items as full width", () => {
      const { el } = makeSelected();
      mockComputedStyle({
        "grid-column-start": "auto",
        "grid-column-end": "-1",
      });

      expect(readGridChildQuickActionState(el).fullWidth).toBe(false);
    });
  });

  describe("parentTrackCount", () => {
    it("counts definite parent tracks", () => {
      const { el } = makeSelected();
      const parent = document.createElement("div");
      parent.appendChild(el);
      document.body.appendChild(parent);
      mockComputedStyle({ "grid-template-columns": "repeat(4, minmax(0, 1fr))" });

      expect(parentTrackCount(el, "column")).toBe(4);
    });

    it("returns null when the track count is CSS-determined", () => {
      const { el } = makeSelected();
      const parent = document.createElement("div");
      parent.appendChild(el);
      document.body.appendChild(parent);
      mockComputedStyle({ "grid-template-columns": "repeat(auto-fit, minmax(12rem, 1fr))" });

      expect(parentTrackCount(el, "column")).toBeNull();
    });

    it("returns null without a parent", () => {
      const el = document.createElement("button");
      el.setAttribute("data-cid", "Button");
      el.setAttribute("data-src", "src/Button.tsx:1:1");
      mockComputedStyle({ "grid-template-columns": "repeat(4, minmax(0, 1fr))" });

      expect(parentTrackCount(el, "column")).toBeNull();
    });
  });

  describe("startLineOptions", () => {
    it("builds Auto plus line numbers 1..tracks+1 (N tracks have N+1 lines)", () => {
      expect(startLineOptions(3)).toEqual([
        { value: "auto", label: "Auto" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ]);
    });

    it("falls back to the default track bound", () => {
      const options = startLineOptions(null);
      expect(options).toHaveLength(14);
      expect(options[0]).toEqual({ value: "auto", label: "Auto" });
      expect(options.at(-1)).toEqual({ value: "13", label: "13" });
    });
  });
});
