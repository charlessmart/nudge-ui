// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTextContentProjection,
  clearCanvasTextProjectionReports,
  EMPTY_TEXT_PROJECTION_ATTR,
  EMPTY_TEXT_PROJECTION_PATH_ATTR,
  getTextContentChangeDiagnostics,
  getTextProjectionReports,
  isTextProjectionReport,
  recordCanvasTextProjectionReports,
  resetTextProjectionState,
  resolveTextProjectionTarget,
  TEXT_PROJECTION_ATTR,
} from "./textProjection.ts";
import type { TextContentChangeRecord } from "../changes/types.ts";

function makeChange(overrides: Partial<TextContentChangeRecord> = {}): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: "text-1",
    target: {
      sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
      occurrence: 0,
      props: "tone:muted",
      ariaLabel: null,
      beforeText: "Original",
    },
    source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
    selector: '[data-cid="Copy"][data-src*="src/Copy.tsx:8:3"]',
    before: "Original",
    after: "Updated",
    authoredAs: "literal",
    ...overrides,
  };
}

function appendCopy(text: string, props = "tone:muted"): HTMLElement {
  const element = document.createElement("p");
  element.dataset.cid = "Copy";
  element.dataset.src = "src/Copy.tsx:8:3";
  element.dataset.cprops = props;
  element.textContent = text;
  document.body.append(element);
  return element;
}

async function flushMutationValidation(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("text projection identity and diagnostics", () => {
  beforeEach(() => {
    resetTextProjectionState();
    document.body.replaceChildren();
  });

  afterEach(() => {
    resetTextProjectionState();
  });

  it("resolves safe before/after evidence but never uses occurrence alone", () => {
    const first = appendCopy("Updated");
    const target = makeChange().target;
    expect(resolveTextProjectionTarget(document, target, "Updated")).toMatchObject({
      status: "resolved",
      element: first,
    });

    appendCopy("Updated");
    expect(resolveTextProjectionTarget(document, target, "Updated")).toEqual({ status: "ambiguous" });

    expect(isTextProjectionReport({ changeId: "text-1", status: "applied" })).toBe(true);
    expect(isTextProjectionReport({ changeId: "", status: "applied" })).toBe(false);
    expect(isTextProjectionReport({ changeId: "text-1", status: "applied", marker: "forbidden" })).toBe(false);
  });

  it("marks the host, reports application, and restores only its own projected value", async () => {
    const element = appendCopy("Original");
    const change = makeChange();

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toBe("text-1");
    expect(element.textContent).toBe("Updated");

    // A clear/revert can safely restore a still-owned projection.
    expect(applyTextContentProjection(document, [])).toEqual([]);
    expect(element.hasAttribute(TEXT_PROJECTION_ATTR)).toBe(false);
    expect(element.textContent).toBe("Original");

    // If the app reconciles newer copy into the marked node, diagnostics report
    // an override and a subsequent snapshot must not reapply the old value.
    applyTextContentProjection(document, [change]);
    element.textContent = "Application value";
    await flushMutationValidation();
    expect(getTextProjectionReports(document)).toEqual([
      { changeId: "text-1", status: "overridden" },
    ]);
    applyTextContentProjection(document, [change]);
    expect(element.textContent).toBe("Application value");
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toBe("text-1");

    // An unrelated text snapshot change must not replay the overridden copy.
    const unrelated = makeChange({
      id: "text-2",
      target: {
        sourceSite: { cid: "Other", src: "src/Other.tsx:2:1" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Other",
      },
      source: { file: "src/Other.tsx", line: 2, column: 1, component: "Other" },
      selector: '[data-cid="Other"][data-src*="src/Other.tsx:2:1"]',
      before: "Other",
      after: "Other updated",
    });
    applyTextContentProjection(document, [change, unrelated]);
    expect(element.textContent).toBe("Application value");

    // A newer value must not be overwritten by clear/undo after reconciliation.
    applyTextContentProjection(document, []);
    expect(element.textContent).toBe("Application value");
  });

  it("round-trips a root marker id that starts with the map prefix", () => {
    const element = appendCopy("Original");
    const change = makeChange({ id: "map:text-1" });

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "map:text-1", status: "applied" },
    ]);
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toBe('map:{"root":"map:text-1"}');
    expect(element.textContent).toBe("Updated");

    expect(applyTextContentProjection(document, [])).toEqual([]);
    expect(element.textContent).toBe("Original");
    expect(element.hasAttribute(TEXT_PROJECTION_ATTR)).toBe(false);
  });

  it("validates and restores an empty projected value", () => {
    const element = appendCopy("Original");
    const change = makeChange({ after: "" });

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);
    expect(element.textContent).toBe("");
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toBe("text-1");
    const affordance = element.querySelector(`[${EMPTY_TEXT_PROJECTION_ATTR}]`);
    expect(affordance).not.toBeNull();
    expect(affordance?.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR)).toBe("root");
    expect(affordance?.textContent).toBe("");

    expect(applyTextContentProjection(document, [])).toEqual([]);
    expect(element.textContent).toBe("Original");
    expect(element.hasAttribute(TEXT_PROJECTION_ATTR)).toBe(false);
    expect(element.querySelector(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)).toBeNull();
  });

  it("places an empty affordance beside the exact nested text node without changing its path", () => {
    const element = document.createElement("h2");
    element.dataset.cid = "App";
    element.dataset.src = "src/App.tsx:221:16";
    const leading = document.createTextNode("Everything here is");
    const lineBreak = document.createElement("br");
    const trailing = document.createElement("span");
    trailing.textContent = "selectable.";
    element.append(leading, lineBreak, trailing);
    document.body.append(element);
    const change = makeChange({
      id: "text-empty-heading",
      target: {
        sourceSite: { cid: "App", src: "src/App.tsx:221:16" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Everything here is",
        textNodePath: [0],
      },
      source: { file: "src/App.tsx", line: 221, column: 16, component: "App" },
      selector: '[data-cid="App"][data-src*="src/App.tsx:221:16"]',
      before: "Everything here is",
      after: "",
    });

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-empty-heading", status: "applied" },
    ]);
    expect(leading.nodeValue).toBe("");
    expect(element.childNodes[0]).toBe(leading);
    expect(element.childNodes[1]).toMatchObject({
      nodeType: Node.ELEMENT_NODE,
    });
    const affordance = element.querySelector(`[${EMPTY_TEXT_PROJECTION_ATTR}]`);
    expect(affordance?.parentElement).toBe(element);
    expect(affordance?.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR)).toBe("path:0");
    expect(resolveTextProjectionTarget(document, change.target, "")).toMatchObject({
      status: "resolved",
      element,
    });

    applyTextContentProjection(document, []);
    expect(element.querySelector(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)).toBeNull();
    expect(leading.nodeValue).toBe("Everything here is");
    expect(element.querySelector("br")).toBe(lineBreak);
    expect(trailing.textContent).toBe("selectable.");
  });

  it("projects a mixed icon and label by changing only the captured text node", () => {
    const element = document.createElement("button");
    element.dataset.cid = "IconButton";
    element.dataset.src = "src/App.tsx:9:3";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = "<path d=\"M0 0h4v4H0z\" />";
    const label = document.createElement("span");
    label.textContent = "Save";
    element.append(icon, label);
    document.body.append(element);
    const target = {
      sourceSite: { cid: "IconButton", src: "src/App.tsx:9:3" },
      occurrence: 0,
      props: null,
      ariaLabel: null,
      beforeText: "Save",
      textNodePath: [1, 0],
    };
    const change = makeChange({
      id: "text-mixed",
      target,
      source: { file: "src/App.tsx", line: 9, column: 3, component: "IconButton" },
      selector: '[data-cid="IconButton"][data-src*="src/App.tsx:9:3"]',
      before: "Save",
      after: "Save file",
    });

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-mixed", status: "applied" },
    ]);
    expect(element.querySelector("path")).not.toBeNull();
    expect(label.textContent).toBe("Save file");
    expect(element.textContent).toBe("Save file");

    expect(applyTextContentProjection(document, [])).toEqual([]);
    expect(element.querySelector("path")).not.toBeNull();
    expect(label.textContent).toBe("Save");
  });

  it("projects a direct heading text node beside a line break and preserves the break", () => {
    const element = document.createElement("h2");
    element.dataset.cid = "App";
    element.dataset.src = "src/App.tsx:221:16";
    const leading = document.createTextNode("Everything here is");
    const lineBreak = document.createElement("br");
    const trailing = document.createElement("span");
    trailing.textContent = "selectable.";
    element.append(leading, lineBreak, trailing);
    document.body.append(element);

    const change = makeChange({
      id: "text-heading",
      target: {
        sourceSite: { cid: "App", src: "src/App.tsx:221:16" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Everything here is",
        textNodePath: [0],
      },
      source: { file: "src/App.tsx", line: 221, column: 16, component: "App" },
      selector: '[data-cid="App"][data-src*="src/App.tsx:221:16"]',
      before: "Everything here is",
      after: "Everything here remains",
    });

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-heading", status: "applied" },
    ]);
    expect(leading.nodeValue).toBe("Everything here remains");
    expect(element.querySelector("br")).toBe(lineBreak);
    expect(element.querySelector("span")?.textContent).toBe("selectable.");

    applyTextContentProjection(document, []);
    expect(leading.nodeValue).toBe("Everything here is");
    expect(element.querySelector("br")).toBe(lineBreak);
    expect(element.querySelector("span")?.textContent).toBe("selectable.");
  });

  it("keeps two safe text nodes under one tracked root independently marked and reversible", async () => {
    const element = document.createElement("button");
    element.dataset.cid = "IconButton";
    element.dataset.src = "src/App.tsx:9:3";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = "<path d=\"M0 0h4v4H0z\" />";
    const leading = document.createTextNode("Save");
    const label = document.createElement("span");
    label.textContent = " now";
    element.append(leading, icon, label);
    document.body.append(element);

    const first = makeChange({
      id: "text-leading",
      target: {
        sourceSite: { cid: "IconButton", src: "src/App.tsx:9:3" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Save",
        textNodePath: [0],
      },
      before: "Save",
      after: "Save file",
    });
    const second = makeChange({
      id: "text-label",
      target: {
        sourceSite: { cid: "IconButton", src: "src/App.tsx:9:3" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: " now",
        textNodePath: [2, 0],
      },
      before: " now",
      after: " later",
    });

    expect(applyTextContentProjection(document, [first, second])).toEqual([
      { changeId: "text-leading", status: "applied" },
      { changeId: "text-label", status: "applied" },
    ]);
    expect(leading.nodeValue).toBe("Save file");
    expect(label.textContent).toBe(" later");
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toContain("text-leading");
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toContain("text-label");

    // Reconciliation of one exact node must not reapply over the other node.
    leading.nodeValue = "Application copy";
    await flushMutationValidation();
    expect(getTextProjectionReports(document)).toEqual([
      { changeId: "text-leading", status: "overridden" },
      { changeId: "text-label", status: "applied" },
    ]);
    applyTextContentProjection(document, [first, second]);
    expect(leading.nodeValue).toBe("Application copy");
    expect(label.textContent).toBe(" later");

    applyTextContentProjection(document, []);
    expect(leading.nodeValue).toBe("Application copy");
    expect(label.textContent).toBe(" now");
    expect(element.hasAttribute(TEXT_PROJECTION_ATTR)).toBe(false);
  });

  it("accepts an already-updated document on initial apply and reports missing/ambiguous", async () => {
    appendCopy("Updated");
    const change = makeChange();
    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);

    const refreshed = document.implementation.createHTMLDocument("refreshed");
    const missing = refreshed.createElement("p");
    missing.dataset.cid = "Copy";
    missing.dataset.src = "src/Copy.tsx:8:3";
    missing.dataset.cprops = "tone:muted";
    missing.textContent = "Not the authored text";
    refreshed.body.append(missing);
    expect(applyTextContentProjection(refreshed, [change])).toEqual([
      { changeId: "text-1", status: "missing" },
    ]);
    const late = refreshed.createElement("p");
    late.dataset.cid = "Copy";
    late.dataset.src = "src/Copy.tsx:8:3";
    late.dataset.cprops = "tone:muted";
    late.textContent = "Original";
    refreshed.body.append(late);
    applyTextContentProjection(refreshed, [change]);
    expect(getTextProjectionReports(refreshed)).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);
    expect(late.textContent).toBe("Updated");

    const ambiguous = document.implementation.createHTMLDocument("ambiguous");
    for (const text of ["Original", "Original"]) {
      const item = ambiguous.createElement("p");
      item.dataset.cid = "Copy";
      item.dataset.src = "src/Copy.tsx:8:3";
      item.dataset.cprops = "tone:muted";
      item.textContent = text;
      ambiguous.body.append(item);
    }
    expect(applyTextContentProjection(ambiguous, [change])).toEqual([
      { changeId: "text-1", status: "ambiguous" },
    ]);
  });

  it("retries a missing projection when a lazy route mounts its tracked root", async () => {
    const change = makeChange();
    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-1", status: "missing" },
    ]);
    const element = appendCopy("Original");
    await flushMutationValidation();
    expect(getTextProjectionReports(document)).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);
    expect(element.textContent).toBe("Updated");
  });

  it("does not restore text after the source identity evidence changes", async () => {
    const element = appendCopy("Original");
    const change = makeChange();

    expect(applyTextContentProjection(document, [change])).toEqual([
      { changeId: "text-1", status: "applied" },
    ]);
    expect(element.textContent).toBe("Updated");

    element.dataset.cid = "Other";
    element.dataset.src = "src/Other.tsx:1:1";
    await flushMutationValidation();
    expect(getTextProjectionReports(document)).toEqual([
      { changeId: "text-1", status: "overridden" },
    ]);

    applyTextContentProjection(document, []);
    expect(element.textContent).toBe("Updated");
    expect(element.hasAttribute(TEXT_PROJECTION_ATTR)).toBe(false);
  });

  it("accepts only current canonical ids from Canvas diagnostics and ignores stale reports", () => {
    appendCopy("Original");
    const change = makeChange({
      scope: "rendered-instance",
      evidence: {
        callsiteId: "src/App.tsx:12:5",
        componentName: "Label",
        property: "text",
        mountedCount: 2,
      },
    });
    applyTextContentProjection(document, [change]);
    recordCanvasTextProjectionReports("card-1", 2, [{ changeId: "text-1", status: "applied" }]);
    expect(getTextContentChangeDiagnostics("text-1")).toEqual([
      {
        changeId: "text-1",
        status: "applied",
        document: "Inspect",
        scope: "rendered-instance",
        evidence: change.evidence,
      },
      {
        changeId: "text-1",
        status: "applied",
        document: "Canvas card-1",
        scope: "rendered-instance",
        evidence: change.evidence,
      },
    ]);
    recordCanvasTextProjectionReports("card-1", 1, [{ changeId: "text-1", status: "missing" }]);
    clearCanvasTextProjectionReports("card-1");
  });
});
