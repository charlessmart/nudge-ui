// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createCidIndex, RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";

function el(cid = "BranchView", src = "src/a.tsx:1:1"): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("data-cid", cid);
  node.setAttribute("data-src", src);
  return node;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createCidIndex", () => {
  it("assigns distinct renderer IDs without scanning the document", () => {
    const index = createCidIndex(document);
    const a = el();
    const b = el();
    document.body.append(a, b);

    expect(index.elementId(a)).toBe("r1");
    expect(index.elementId(b)).toBe("r2");
    expect(a.getAttribute(RENDERER_ELEMENT_ID_ATTR)).toBe("r1");
    expect(b.getAttribute(RENDERER_ELEMENT_ID_ATTR)).toBe("r2");
  });

  it("keeps the same ID when nodes are reordered or attributes change", () => {
    const index = createCidIndex(document);
    const a = el();
    const b = el();
    document.body.append(a, b);
    const aId = index.elementId(a);
    const bId = index.elementId(b);

    document.body.prepend(b);
    a.setAttribute("data-src", "src/changed.tsx:1:1");

    expect(index.elementId(a)).toBe(aId);
    expect(index.elementId(b)).toBe(bId);
  });

  it("assigns a new ID to a remounted node", () => {
    const index = createCidIndex(document);
    const original = el();
    document.body.appendChild(original);
    const originalId = index.elementId(original);
    original.remove();

    const remounted = el();
    document.body.appendChild(remounted);
    expect(index.elementId(remounted)).not.toBe(originalId);
  });

  it("returns a stable ID for an element without source metadata", () => {
    const index = createCidIndex(document);
    const plain = document.createElement("span");
    document.body.appendChild(plain);
    expect(index.elementId(plain)).toBe(index.elementId(plain));
  });
});
