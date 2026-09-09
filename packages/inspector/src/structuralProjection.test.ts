// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearWorkspace, loadWorkspaceChanges, redo, undo } from "./changesLog.ts";
import {
  applyStructuralDeleteProjection,
  applyStructuralProjection,
  createStructuralDelete,
  createStructuralMove,
  getStructuralChangeDiagnostics,
  getStructuralDeletes,
  getStructuralChanges,
  getStructuralProjectionReports,
  reconcileVerifiedStructuralChanges,
  recordCanvasStructuralProjectionReports,
  resetStructuralDeleteProjection,
  revertStructuralChange,
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
        locator: { kind: "evidence", occurrence: 1, props: null, text: "0.2", ariaLabel: null },
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
      .toEqual([{ changeId: "delete-1", status: "missing", reason: "target" }]);
    expect(target.isConnected).toBe(true);
    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "missing", reason: "target" }]);
  });

  it("leaves ambiguous repeated targets visible", () => {
    const first = add("");
    add("");
    const change = createStructuralDelete(first, "delete-1")!;

    expect(applyStructuralDeleteProjection(document, [change]))
      .toEqual([{ changeId: "delete-1", status: "ambiguous", reason: "target" }]);
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
      source: { parent: { sourceSite: { cid: "List", src: "src/App.tsx:5:1" } } },
      presentation: { sourceParentTag: "section", destinationParentTag: "section", fromIndex: 1, toIndex: 0 },
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
      .toEqual([{ changeId: "move-1", status: "missing", reason: "source-parent" }]);
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
      .toEqual([{ changeId: "move-1", status: "missing", reason: "target" }]);
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

  it("captures a cross-container move and rejects an invalid self-anchor", () => {
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

    const change = createStructuralMove(second, { parent: secondParent, before: null }, "move-cross");
    expect(change).toMatchObject({
      kind: "move",
      source: { parent: { sourceSite: { cid: "List", src: "src/App.tsx:5:1" } } },
      destination: { parent: { sourceSite: { cid: "OtherList", src: "src/App.tsx:6:1" } }, before: null },
      presentation: { sourceParentTag: "section", destinationParentTag: "section", fromIndex: 1, toIndex: 0 },
    });
    expect(createStructuralMove(second, { parent: firstParent, before: second }, "move-self")).toBeNull();
    expect(getStructuralChanges()).toEqual([change]);
    expect(applyStructuralProjection(document, getStructuralChanges()))
      .toEqual([{ changeId: "move-cross", status: "applied" }]);
    expect(Array.from(firstParent.children).map((el) => el.textContent)).toEqual(["0.1"]);
    expect(Array.from(secondParent.children).map((el) => el.textContent)).toEqual(["0.2"]);
  });

  it("replays a cross-container A-to-B-to-C sequence and restores it in reverse order", () => {
    const source = document.createElement("section");
    source.dataset.cid = "Source";
    source.dataset.src = "src/App.tsx:20:1";
    const middle = document.createElement("aside");
    middle.dataset.cid = "Middle";
    middle.dataset.src = "src/App.tsx:21:1";
    const destination = document.createElement("footer");
    destination.dataset.cid = "Destination";
    destination.dataset.src = "src/App.tsx:22:1";
    document.body.append(source, middle, destination);

    const target = document.createElement("button");
    target.dataset.cid = "MoveTarget";
    target.dataset.src = "src/App.tsx:23:1";
    target.textContent = "Target";
    source.append(target);

    createStructuralMove(target, { parent: middle, before: null }, "move-a-b");
    applyStructuralProjection(document, getStructuralChanges());
    expect(target.parentElement).toBe(middle);

    createStructuralMove(target, { parent: destination, before: null }, "move-b-c");
    expect(target.parentElement).toBe(destination);

    expect(undo()).toBe(true);
    expect(target.parentElement).toBe(middle);
    expect(redo()).toBe(true);
    expect(target.parentElement).toBe(destination);
    expect(getStructuralProjectionReports(document)).toEqual([
      { changeId: "move-a-b", status: "applied" },
      { changeId: "move-b-c", status: "applied" },
    ]);
  });

  it("fails closed when a target is no longer under its captured source parent", () => {
    const source = document.createElement("section");
    source.dataset.cid = "Source";
    source.dataset.src = "src/App.tsx:30:1";
    const destination = document.createElement("aside");
    destination.dataset.cid = "Destination";
    destination.dataset.src = "src/App.tsx:31:1";
    const target = document.createElement("button");
    target.dataset.cid = "MoveTarget";
    target.dataset.src = "src/App.tsx:32:1";
    source.append(target);
    document.body.append(source, destination);

    const change = createStructuralMove(target, { parent: destination, before: null }, "move-conflict")!;
    destination.append(target);

    expect(applyStructuralProjection(document, [change])).toEqual([
      { changeId: "move-conflict", status: "missing", reason: "source-parent" },
    ]);
    expect(target.parentElement).toBe(destination);
    expect(source.children).toHaveLength(0);
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
      .toEqual([{ changeId: "move-1", status: "ambiguous", reason: "source-parent" }]);
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

  it("reconciles only verified structural changes and never restores them through history", () => {
    const first = add("0.1");
    const second = add("0.2");
    createStructuralDelete(first, "delete-verified");
    createStructuralDelete(second, "delete-review");
    applyStructuralProjection(document, getStructuralChanges());

    expect(reconcileVerifiedStructuralChanges(new Set(["delete-verified"]))).toBe(1);
    expect(getStructuralChanges().map((change) => change.id)).toEqual(["delete-review"]);

    while (undo()) {
      expect(getStructuralChanges().some((change) => change.id === "delete-verified")).toBe(false);
    }
    while (redo()) {
      expect(getStructuralChanges().some((change) => change.id === "delete-verified")).toBe(false);
    }
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

    expect(undo()).toBe(true);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.1", "0.2", "0.3"]);
    expect(redo()).toBe(true);
    expect(Array.from(parent.children).map((el) => el.textContent)).toEqual(["0.3", "0.1", "0.2"]);
  });

  it("clears canonical changes and restores a projected delete", () => {
    add("0.1");
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    expect(target.isConnected).toBe(false);

    clearWorkspace();
    expect(getStructuralChanges()).toEqual([]);
    expect(document.body.textContent).toContain("0.2");
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
  });

  it("clears host and Canvas diagnostics with the canonical snapshot", () => {
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    recordCanvasStructuralProjectionReports("card-1", 1, [{ changeId: "delete-1", status: "applied" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toHaveLength(2);

    clearWorkspace();

    expect(getStructuralChangeDiagnostics("delete-1")).toEqual([]);
    expect(target.isConnected).toBe(true);
  });

  it("hydrates a valid canonical snapshot without creating history and projects it locally", () => {
    add("0.1");
    const target = add("0.2");
    const captured = createStructuralDelete(target, "delete-1")!;
    clearWorkspace();

    loadWorkspaceChanges([], [captured]);

    expect(getStructuralChanges()).toEqual([captured]);
    expect(document.body.textContent).toBe("0.1");
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
  });

  it("accepts only current canvas reports and keeps the newest revision", () => {
    const target = add("0.2");
    createStructuralDelete(target, "delete-1");

    recordCanvasStructuralProjectionReports("card-1", 2, [{ changeId: "delete-1", status: "applied" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 1, [{ changeId: "delete-1", status: "overridden", reason: "react-override" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 3, [{ changeId: "other", status: "missing", reason: "target" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "applied",
    });

    recordCanvasStructuralProjectionReports("card-1", 3, [{ changeId: "delete-1", status: "overridden", reason: "react-override" }]);
    expect(getStructuralChangeDiagnostics("delete-1")).toContainEqual({
      document: "Canvas card-1", changeId: "delete-1", status: "overridden", reason: "react-override",
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

    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "overridden", reason: "react-override" }]);
    applyStructuralProjection(document, [change]);
    expect(document.body.textContent).toContain("React replacement");
    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "delete-1", status: "overridden", reason: "react-override" }]);
  });

  it("reports a move as overridden when React changes its evidence in place", async () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, second);
    const change = createStructuralMove(second, { parent, before: first }, "move-1")!;
    applyStructuralProjection(document, [change]);

    second.firstChild!.nodeValue = "updated";
    await Promise.resolve();
    await Promise.resolve();

    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "move-1", status: "overridden", reason: "react-override" }]);
  });

  it("reports a move as overridden when React changes its tracked props in place", async () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    document.body.append(parent);
    const first = add("0.1");
    const second = add("0.2");
    parent.append(first, second);
    const change = createStructuralMove(second, { parent, before: first }, "move-1")!;
    applyStructuralProjection(document, [change]);

    second.dataset.cprops = '{"id":"updated"}';
    await Promise.resolve();
    await Promise.resolve();

    expect(getStructuralProjectionReports(document)).toEqual([{ changeId: "move-1", status: "overridden", reason: "react-override" }]);
  });
});
