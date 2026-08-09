// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { countSourceSiteMatches, getEditScope, getInstanceEvidence, relinkElement, resetSourceSiteMatchCounts, selectorForElement, unlinkElement } from "./editScope";
import { resetRenderedInstanceState } from "./renderedInstance";

describe("edit scope", () => {
  beforeEach(() => { document.body.innerHTML = ""; resetRenderedInstanceState(); });
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
  it("starts and clears a durable rendered-instance edit target without a DOM identity", () => {
    const first = add("one"); add("two");
    const id = unlinkElement(first);
    expect(id).toMatch(/^override-/);
    expect(getEditScope(first)).toBe("rendered-instance");
    expect(first.hasAttribute("data-dt-instance")).toBe(false);
    expect(selectorForElement(first)).toContain("data-cid");
    expect(relinkElement(first)).toBe(id);
    expect(getEditScope(first)).toBe("source-site");
  });
  it("captures a zero-based rendered index and short text", () => {
    add("one"); const second = add("two");
    expect(getInstanceEvidence(second)).toEqual({ renderedIndex: 1, props: null, text: "two" });
  });
  it("counts and indexes matches in an iframe element's own document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    const elements = ["one", "two"].map((text) => {
      const el = frameDocument.createElement("button");
      el.dataset.cid = "Item";
      el.dataset.src = "src/Item.tsx:4:3";
      el.textContent = text;
      frameDocument.body.appendChild(el);
      return el;
    });

    expect(countSourceSiteMatches(elements[0]!)).toBe(2);
    expect(getInstanceEvidence(elements[1]!)).toMatchObject({ renderedIndex: 1, text: "two" });
  });

  it("memoizes the match count per scope revision", () => {
    resetSourceSiteMatchCounts();
    const first = add("one"); add("two");
    expect(countSourceSiteMatches(first)).toBe(2);

    // The DOM gained a third sibling, but the scope revision is unchanged so
    // the memoized count for revision 0 stays put.
    add("three");
    expect(countSourceSiteMatches(first)).toBe(2);

    // Bumping the scope revision recomputes the full-document scan.
    expect(countSourceSiteMatches(first, 1)).toBe(3);
  });

  it("keeps counting the source site after unlinking one instance", () => {
    resetSourceSiteMatchCounts();
    const first = add("one"); add("two");
    unlinkElement(first);
    expect(countSourceSiteMatches(first)).toBe(2);
    expect(countSourceSiteMatches(add("three"))).toBe(3);
  });
});
