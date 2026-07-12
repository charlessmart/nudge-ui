// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { countSourceSiteMatches, getEditScope, getInstanceEvidence, relinkElement, selectorForElement, unlinkElement } from "./editScope";

describe("edit scope", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  function add(text: string): HTMLElement {
    const el = document.createElement("button");
    el.dataset.cid = "Item"; el.dataset.src = "src/Item.tsx:4:3"; el.textContent = text;
    document.body.append(el); return el;
  }
  it("counts source-site matches and defaults to source-site", () => {
    const first = add("one"); add("two");
    expect(countSourceSiteMatches(first)).toBe(2);
    expect(getEditScope(first)).toBe("source-site");
    expect(selectorForElement(first)).toContain("data-cid");
  });
  it("unlinks and re-links one runtime instance", () => {
    const first = add("one"); add("two");
    unlinkElement(first);
    expect(getEditScope(first)).toBe("instance-preview");
    expect(document.querySelectorAll(selectorForElement(first)!)).toHaveLength(1);
    relinkElement(first);
    expect(getEditScope(first)).toBe("source-site");
  });
  it("captures a zero-based rendered index and short text", () => {
    add("one"); const second = add("two");
    expect(getInstanceEvidence(second)).toEqual({ renderedIndex: 1, props: null, text: "two" });
  });
});
