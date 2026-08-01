// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCidIndex } from "./rendererCidIndex.ts";

function el(cid: string, src: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("data-cid", cid);
  node.setAttribute("data-src", src);
  return node;
}

async function flushMutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createCidIndex", () => {
  it("returns the document-order instanceIndex for a (cid,src) identity", () => {
    const index = createCidIndex(document);
    const a = el("BranchView", "src/a.tsx:1:1");
    const b = el("BranchView", "src/a.tsx:1:1");
    const c = el("BranchView", "src/a.tsx:1:1");
    const other = el("BranchView", "src/b.tsx:1:1");
    document.body.append(a, b, c, other);

    expect(index.instanceIndex(a)).toBe(0);
    expect(index.instanceIndex(b)).toBe(1);
    expect(index.instanceIndex(c)).toBe(2);
    expect(index.instanceIndex(other)).toBe(0);
  });

  it("rebuilds lazily on append", async () => {
    const index = createCidIndex(document);
    const a = el("C", "s");
    document.body.appendChild(a);
    expect(index.instanceIndex(a)).toBe(0);

    const b = el("C", "s");
    document.body.appendChild(b);
    await flushMutations();

    expect(index.instanceIndex(a)).toBe(0);
    expect(index.instanceIndex(b)).toBe(1);
  });

  it("rebuilds lazily on remove", async () => {
    const index = createCidIndex(document);
    const a = el("C", "s");
    const b = el("C", "s");
    const c = el("C", "s");
    document.body.append(a, b, c);
    expect(index.instanceIndex(c)).toBe(2);

    b.remove();
    await flushMutations();

    expect(index.instanceIndex(a)).toBe(0);
    expect(index.instanceIndex(c)).toBe(1);
  });

  it("rebuilds lazily on reorder", async () => {
    const index = createCidIndex(document);
    const a = el("C", "s");
    const b = el("C", "s");
    const c = el("C", "s");
    document.body.append(a, b, c);
    expect(index.instanceIndex(b)).toBe(1);

    document.body.prepend(c);
    await flushMutations();

    expect(index.instanceIndex(c)).toBe(0);
    expect(index.instanceIndex(a)).toBe(1);
    expect(index.instanceIndex(b)).toBe(2);
  });

  it("rebuilds lazily when data-cid/data-src attributes change", async () => {
    const index = createCidIndex(document);
    const a = el("C", "s");
    const b = el("C", "s");
    document.body.append(a, b);
    expect(index.instanceIndex(a)).toBe(0);
    expect(index.instanceIndex(b)).toBe(1);

    a.setAttribute("data-src", "t");
    await flushMutations();

    expect(index.instanceIndex(b)).toBe(0);
    expect(index.instanceIndex(a)).toBe(0);

    b.setAttribute("data-cid", "D");
    await flushMutations();

    expect(index.instanceIndex(a)).toBe(0);
    expect(index.instanceIndex(b)).toBe(0);
  });

  it("does not scan the document inside the observer callback", async () => {
    const scan = vi.spyOn(document, "querySelectorAll");
    const index = createCidIndex(document);
    const a = el("C", "s");
    document.body.appendChild(a);

    expect(index.instanceIndex(a)).toBe(0);
    expect(scan).toHaveBeenCalledTimes(1);

    const b = el("C", "s");
    document.body.appendChild(b);
    await flushMutations();

    expect(scan).toHaveBeenCalledTimes(1);

    expect(index.instanceIndex(b)).toBe(1);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("returns 0 for elements without data-cid", () => {
    const index = createCidIndex(document);
    const plain = document.createElement("span");
    document.body.appendChild(plain);
    expect(index.instanceIndex(plain)).toBe(0);
  });
});
