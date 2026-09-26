// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeDescendants, computeHierarchy, computeNavigationNodes } from "./hierarchy.ts";

describe("computeHierarchy", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    host.id = "nudge-ui-root";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the 3-level chain closest-first", () => {
    const outer = document.createElement("div");
    outer.setAttribute("data-cid", "App");
    const mid = document.createElement("div");
    mid.setAttribute("data-cid", "Card");
    const inner = document.createElement("button");
    inner.setAttribute("data-cid", "Button");
    mid.appendChild(inner);
    outer.appendChild(mid);
    document.body.appendChild(outer);

    const chain = computeHierarchy(inner);
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(inner);
    expect(chain[1]).toBe(mid);
    expect(chain[2]).toBe(outer);
  });

  it("skips intermediate non-data-cid elements", () => {
    const parent = document.createElement("div");
    parent.setAttribute("data-cid", "App");
    const wrapper = document.createElement("div");
    const span = document.createElement("span");
    const leaf = document.createElement("button");
    span.appendChild(leaf);
    wrapper.appendChild(span);
    parent.appendChild(wrapper);
    document.body.appendChild(parent);

    const chain = computeHierarchy(leaf);
    expect(chain).toEqual([parent]);
  });

  it("returns just [el] when el is body-level with data-cid", () => {
    const top = document.createElement("div");
    top.setAttribute("data-cid", "Root");
    document.body.appendChild(top);
    const chain = computeHierarchy(top);
    expect(chain).toEqual([top]);
  });

  it("returns [] when el has no data-cid and no data-cid ancestor up to body", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(computeHierarchy(el)).toEqual([]);
  });

  it("skips the inspector host root", () => {
    const inner = document.createElement("div");
    inner.setAttribute("data-cid", "InspectorBit");
    host.appendChild(inner);
    expect(computeHierarchy(host)).toEqual([]);
    expect(computeHierarchy(inner)).toEqual([]);
  });

  it("skips shadow-DOM children", () => {
    const shadow = host.attachShadow({ mode: "open" });
    const shadowEl = document.createElement("div");
    shadowEl.setAttribute("data-cid", "ShadowCid");
    shadow.appendChild(shadowEl);
    expect(computeHierarchy(shadowEl)).toEqual([]);
  });

  it("builds hierarchy within an iframe document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    const parent = frameDocument.createElement("section");
    parent.dataset.cid = "Card";
    const child = frameDocument.createElement("button");
    child.dataset.cid = "Button";
    parent.appendChild(child);
    frameDocument.body.appendChild(parent);

    expect(computeHierarchy(child)).toEqual([child, parent]);
  });

  it("returns the nearest tracked descendants breadth-first", () => {
    const root = document.createElement("main");
    root.dataset.cid = "Root";
    const first = document.createElement("section");
    first.dataset.cid = "First";
    const firstChild = document.createElement("button");
    firstChild.dataset.cid = "FirstChild";
    const second = document.createElement("section");
    second.dataset.cid = "Second";
    root.append(first, second);
    first.appendChild(firstChild);
    document.body.appendChild(root);

    expect(computeDescendants(root)).toEqual([
      { element: first, depth: 1 },
      { element: second, depth: 1 },
    ]);
    expect(computeDescendants(root, 2, 3)).toEqual([
      { element: first, depth: 1 },
      { element: second, depth: 1 },
      { element: firstChild, depth: 2 },
    ]);
  });

  it("uses two parents and two descendants when both directions exist", () => {
    const grandparent = document.createElement("div");
    grandparent.dataset.cid = "Grandparent";
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    const selected = document.createElement("div");
    selected.dataset.cid = "Selected";
    const child = document.createElement("div");
    child.dataset.cid = "Child";
    const grandchild = document.createElement("div");
    grandchild.dataset.cid = "Grandchild";
    grandparent.append(parent);
    parent.append(selected);
    selected.append(child);
    child.append(grandchild);
    document.body.append(grandparent);

    expect(computeNavigationNodes(selected, [selected, parent, grandparent])).toEqual([
      { element: parent, direction: "up", depth: 1 },
      { element: grandparent, direction: "up", depth: 2 },
      { element: child, direction: "down", depth: 1 },
      { element: grandchild, direction: "down", depth: 2 },
    ]);
  });

  it("uses four parents when there are no descendants", () => {
    const nodes = Array.from({ length: 5 }, (_, index) => {
      const node = document.createElement("div");
      node.dataset.cid = `Node${index}`;
      return node;
    });
    nodes.slice(1).reduce((child, parent) => {
      parent.append(child);
      return parent;
    }, nodes[0]!);
    document.body.append(nodes.at(-1)!);

    expect(computeNavigationNodes(nodes[0]!, nodes)).toEqual([
      { element: nodes[1], direction: "up", depth: 1 },
      { element: nodes[2], direction: "up", depth: 2 },
      { element: nodes[3], direction: "up", depth: 3 },
      { element: nodes[4], direction: "up", depth: 4 },
    ]);
  });
});
