import { describe, expect, it } from "vitest";
import { isStructuralMove } from "./structuralProjectionBoundary.ts";
import type { StructuralMove } from "../changes/structuralTypes.ts";

const ref = (cid: string, src: string) => ({
  sourceSite: { cid, src },
  locator: { kind: "evidence" as const, occurrence: 0, props: null, text: null },
});

const move: StructuralMove = {
  id: "move-1",
  kind: "move",
  target: ref("Page", "src/Page.tsx:30:5"),
  source: { parent: ref("Page", "src/Page.tsx:28:3") },
  destination: { parent: ref("Stack", "src/ui/Stack.tsx:8:10"), before: null },
  presentation: { sourceParentTag: "section", destinationParentTag: "div", fromIndex: 0, toIndex: 0 },
};

describe("isStructuralMove", () => {
  it("accepts records with and without a children slot", () => {
    const childrenOf = { callsiteId: "src/Page.tsx:12:5", componentName: "Stack" };
    expect(isStructuralMove(move)).toBe(true);
    expect(isStructuralMove({ ...move, source: { ...move.source, childrenOf }, destination: { ...move.destination, childrenOf } })).toBe(true);
  });

  it("rejects a malformed children slot", () => {
    expect(isStructuralMove({ ...move, destination: { ...move.destination, childrenOf: { callsiteId: "" } } })).toBe(false);
  });
});
