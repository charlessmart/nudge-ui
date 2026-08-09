// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyStructuralDeleteProjection,
  applyStructuralProjection,
  createStructuralDelete,
  createStructuralMove,
  clearStructuralChanges,
  getStructuralChangeDiagnostics,
  getStructuralDeletes,
  getStructuralChanges,
  getStructuralProjectionReports,
  hydrateStructuralChanges,
  recordCanvasStructuralProjectionReports,
  redoStructuralChange,
  resetStructuralDeleteProjection,
  revertStructuralChange,
  undoStructuralChange,
} from "./structuralProjection.ts";

function add(text: string): HTMLElement {
  const el = document.createElement("button");
  el.dataset.cid = "RepeatedItem";
  el.dataset.src = "src/App.tsx:12:5";
  el.textContent = text;
  document.body.append(el);
  return el;
}

describe("structural delete projection", () => {
  beforeEach(() => {
    resetStructuralDeleteProjection();
    document.body.replaceChildren();
  });

  it("stores only a durable rendered-instance target and deletes that item", () => {
    add("0.1");
    const target = add("0.2");
    add("0.3");
    const change = createStructuralDelete(target, "delete-1")!;

    expect(change).toEqual({
      id: "delete-1",
      kind: "delete",
      target: {
        sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
        locator: { kind: "evidence", occurrence: 1, props: null, text: "0.2" },
      },
    });
    const report = applyStructuralDeleteProjection(document, getStructuralDeletes());
    expect(report).toEqual([{ changeId: "delete-1", status: "applied" }]);
    expect(document.body.textContent).toContain("0.1");
    expect(document.body.textContent).not.toContain("0.2");
    expect(document.body.textContent).toContain("0.3");
  });

  it("leaves a changed target visible and reports missing", () => {
    add("0.1");
    const target = add("0.2");
    const change = createStructuralDelete(target, "delete-1")!;
    target.textContent = "updated";

    expect(applyStructuralDeleteProjection(document, [change]))
      .toEqual([{ changeId: "delete-1", status: "missing" }]);
    expect(target.isConnected).toBe(true);
    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "missing" }]);
  });

  it("leaves ambiguous repeated targets visible", () => {
    const first = add("");
    add("");
    const change = createStructuralDelete(first, "delete-1")!;

    expect(applyStructuralDeleteProjection(document, [change]))
      .toEqual([{ changeId: "delete-1", status: "ambiguous" }]);
    expect(document.querySelectorAll('[data-cid="RepeatedItem"]')).toHaveLength(2);
  });

  it("captures a sibling move with parent and before references, then reorders only that item", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    const third = add("0.3");
    parent.append(first, second, third);

    const change = createStructuralMove(second, { parent, before: first }, "move-1");

    expect(change).toMatchObject({
      id: "move-1",
      kind: "move",
      target: { locator: { kind: "evidence", occurrence: 1, text: "0.2" } },
      destination: {
        parent: { sourceSite: { cid: "List", src: "src/App.tsx:5:1" } },
        before: { locator: { kind: "evidence", occurrence: 0, text: "0.1" } },
      },
    });
    expect(applyStructuralProjection(document, getStructuralChanges()))
      .toEqual([{ changeId: "move-1", status: "applied" }]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.2", "0.1", "0.3"]);
  });

  it("rejects a non-element anchor and leaves the source document unchanged", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, document.createTextNode("gap"), second);

    expect(createStructuralMove(second, { parent, before: first.nextSibling }, "move-1")).toBeNull();
    expect(getStructuralChanges()).toEqual([]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.1", "0.2"]);
  });

  it("reports a missing anchor without changing sibling order", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, second);
    const change = createStructuralMove(second, { parent, before: first }, "move-1")!;
    first.textContent = "changed";

    expect(applyStructuralProjection(document, [change]))
      .toEqual([{ changeId: "move-1", status: "missing" }]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["changed", "0.2"]);
  });

  it("reports a missing target without changing sibling order", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, second);
    const change = createStructuralMove(second, { parent, before: first }, "move-1")!;
    second.textContent = "changed";

    expect(applyStructuralProjection(document, [change]))
      .toEqual([{ changeId: "move-1", status: "missing" }]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.1", "changed"]);
  });

  it("captures a null anchor as append-to-end placement", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    const third = add("0.3");
    parent.append(first, second, third);

    const change = createStructuralMove(first, { parent, before: null }, "move-append")!;

    expect(change.destination.before).toBeNull();
    expect(applyStructuralProjection(document, [change]))
      .toEqual([{ changeId: "move-append", status: "applied" }]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.2", "0.3", "0.1"]);
  });

  it("rejects a cross-container or self-anchor intent without recording it", () => {
    const firstParent = document.createElement("section");
    firstParent.dataset.cid = "List";
    firstParent.dataset.src = "src/App.tsx:5:1";
    const secondParent = document.createElement("section");
    secondParent.dataset.cid = "OtherList";
    secondParent.dataset.src = "src/App.tsx:6:1";
    document.body.append(firstParent, secondParent);
    const first = add("0.1");
    const second = add("0.2");
    firstParent.append(first, second);

    expect(createStructuralMove(second, { parent: secondParent, before: null }, "move-cross")).toBeNull();
    expect(createStructuralMove(second, { parent: firstParent, before: second }, "move-self")).toBeNull();
    expect(getStructuralChanges()).toEqual([]);
    expect(Array.from(firstParent.children).map((el) => el.textContent)).toEqual(["0.1", "0.2"]);
  });

  it("reports an ambiguous parent without changing the source sibling order", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, second);
    const change = createStructuralMove(second, { parent, before: first }, "move-1")!;
    const duplicateParent = parent.cloneNode(false) as HTMLElement;
    duplicateParent.textContent = parent.textContent;
    document.body.append(duplicateParent);

    expect(applyStructuralProjection(document, [change]))
      .toEqual([{ changeId: "move-1", status: "ambiguous" }]);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.1", "0.2"]);
  });

  it("reverts a projected delete by rebuilding this document from the canonical snapshot", () => {
    add("0.1");
    const target = add("0.2");
    add("0.3");
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    expect(document.body.textContent).not.toContain("0.2");

    expect(revertStructuralChange("delete-1")).toBe(true);
    expect(document.body.textContent).toContain("0.2");
    expect(getStructuralProjectionReports(document)).toEqual([]);
  });

  it("undoes and redoes a projected same-parent move from its original relative placement", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    const third = add("0.3");
    parent.append(first, second, third);
    createStructuralMove(third, { parent, before: first }, "move-1");
    applyStructuralProjection(document, getStructuralChanges());
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.3", "0.1", "0.2"]);

    expect(undoStructuralChange()).toBe(true);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.1", "0.2", "0.3"]);
    expect(redoStructuralChange()).toBe(true);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.3", "0.1", "0.2"]);
  });

  it("clears canonical changes and restores a projected delete", () => {
    add("0.1");
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    expect(target.isConnected).toBe(false);

    clearStructuralChanges();
    expect(getStructuralChanges()).toEqual([]);
    expect(document.body.textContent).toContain("0.2");
    expect(undoStructuralChange()).toBe(false);
    expect(redoStructuralChange()).toBe(false);
  });

  it("clears host and Canvas diagnostics with the canonical snapshot", () => {
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    recordCanvasStructuralProjectionReports("card-1", 1, [{ changeId: "delete-1", status: "applied" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toHaveLength(2);

    clearStructuralChanges();

    expect(getStructuralChangeDiagnostics("delete-1")).toEqual([]);
    expect(target.isConnected).toBe(true);
  });

  it("hydrates a valid canonical snapshot without creating history and projects it locally", () => {
    add("0.1");
    const target = add("0.2");
    const captured = createStructuralDelete(target, "delete-1")!;
    clearStructuralChanges();

    hydrateStructuralChanges([captured]);

    expect(getStructuralChanges()).toEqual([captured]);
    expect(document.body.textContent).toBe("0.1");
    expect(undoStructuralChange()).toBe(false);
    expect(redoStructuralChange()).toBe(false);
  });

  it("accepts only current canvas reports and keeps the newest revision", () => {
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");

    recordCanvasStructuralProjectionReports("card-1", 2, [{ changeId: "delete-1", status: "applied" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 1, [{ changeId: "delete-1", status: "overridden" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 3, [{ changeId: "other", status: "missing" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 3, [{ changeId: "delete-1", status: "overridden" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "overridden",
    });
  });

  it("reports an overridden delete once without reapplying an identical snapshot", async () => {
    add("0.1");
    const target = add("0.2");
    const change = createStructuralDelete(target, "delete-1")!;
    applyStructuralProjection(document, [change]);
    const placeholder = Array.from(document.body.childNodes).find((node) => node.nodeType === node.COMMENT_NODE)!;
    placeholder.replaceWith(add("React replacement"));
    await Promise.resolve();

    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "overridden" }]);
    applyStructuralProjection(document, [change]);
    expect(document.body.textContent).toContain("React replacement");
    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "overridden" }]);
  });
});
