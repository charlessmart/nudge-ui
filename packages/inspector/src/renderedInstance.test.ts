// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRenderedInstanceProjection,
  captureRenderedInstance,
  getRenderedInstanceProjectionReports,
  instanceSelector,
  resetRenderedInstanceState,
  resolveRenderedInstance,
  type RenderedInstanceOverride,
} from "./renderedInstance.ts";

function add(text: string, props: string | null = null, ariaLabel: string | null = null): HTMLElement {
  const el = document.createElement("button");
  el.dataset.cid = "RepeatedItem";
  el.dataset.src = "src/App.tsx:12:5";
  if (props !== null) el.dataset.cprops = props;
  if (ariaLabel !== null) el.setAttribute("aria-label", ariaLabel);
  el.textContent = text;
  document.body.append(el);
  return el;
}

describe("rendered instance resolver", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetRenderedInstanceState();
  });

  it("captures and resolves one repeated item from bounded evidence", () => {
    add("0.1");
    const target = add("0.2");
    add("0.3");
    const ref = captureRenderedInstance(target)!;

    expect(ref).toEqual({
      sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
      locator: { kind: "evidence", occurrence: 1, props: null, text: "0.2", ariaLabel: null },
    });
    expect(resolveRenderedInstance(document, ref)).toMatchObject({ status: "resolved", element: target });
  });

  it("does not use an ordinal to edit a changed item", () => {
    add("0.1");
    const target = add("0.2");
    add("0.3");
    const ref = captureRenderedInstance(target)!;
    target.textContent = "different";

    expect(resolveRenderedInstance(document, ref)).toEqual({ status: "missing" });
  });

  it("uses unique evidence when a structural change shifts a captured occurrence", () => {
    add("0.1");
    const target = add("0.2");
    add("0.3");
    const ref = captureRenderedInstance(target)!;
    document.body.firstElementChild?.remove();

    expect(resolveRenderedInstance(document, ref)).toMatchObject({ status: "resolved", element: target });
  });

  it("reports ambiguous instead of applying a duplicate with no evidence", () => {
    const first = add("");
    add("");
    const ref = captureRenderedInstance(first)!;
    expect(resolveRenderedInstance(document, ref)).toEqual({ status: "ambiguous" });
  });

  it("reports ambiguous when multiple candidates have the same bounded evidence", () => {
    const first = add("same");
    add("same");
    const ref = captureRenderedInstance(first)!;

    expect(resolveRenderedInstance(document, ref)).toEqual({ status: "ambiguous" });
  });

  it("uses a bounded accessible name when repeated controls have no text", () => {
    add("", null, "Open details");
    const target = add("", null, "Close details");
    const ref = captureRenderedInstance(target)!;

    expect(ref.locator).toMatchObject({ text: null, ariaLabel: "Close details" });
    expect(resolveRenderedInstance(document, ref)).toMatchObject({ status: "resolved", element: target });
  });

  it("derives a document-local marker and exact managed selector", () => {
    add("0.1");
    const target = add("0.2");
    const override: RenderedInstanceOverride = { id: "override-42", target: captureRenderedInstance(target)! };
    const reports = applyRenderedInstanceProjection(document, [override]);

    expect(reports).toEqual([{ overrideId: "override-42", status: "applied" }]);
    expect(target.getAttribute("data-projection-instance")).toBe("override-42");
    expect(instanceSelector(override)).toContain('[data-projection-instance="override-42"]');
  });

  it("reports a removed marker as overridden and never reapplies the same snapshot", async () => {
    const target = add("0.1");
    const override: RenderedInstanceOverride = { id: "override-42", target: captureRenderedInstance(target)! };
    applyRenderedInstanceProjection(document, [override]);

    target.removeAttribute("data-projection-instance");
    await Promise.resolve();
    await Promise.resolve();

    expect(getRenderedInstanceProjectionReports(document))
      .toEqual([{ overrideId: "override-42", status: "overridden" }]);
    expect(applyRenderedInstanceProjection(document, [override]))
      .toEqual([{ overrideId: "override-42", status: "overridden" }]);
    expect(target.hasAttribute("data-projection-instance")).toBe(false);
  });

  it("reports in-place evidence changes as overridden", async () => {
    const target = add("0.1");
    const override: RenderedInstanceOverride = { id: "override-42", target: captureRenderedInstance(target)! };
    applyRenderedInstanceProjection(document, [override]);

    target.firstChild!.nodeValue = "changed";
    await Promise.resolve();
    await Promise.resolve();

    expect(getRenderedInstanceProjectionReports(document))
      .toEqual([{ overrideId: "override-42", status: "overridden" }]);
  });
});
