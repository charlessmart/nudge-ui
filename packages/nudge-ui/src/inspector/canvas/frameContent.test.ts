// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getLinkedFrameIds, type FrameContent } from "./frameContent.ts";

const frame = (id: string, url: string): { id: string; content: FrameContent } => ({
  id, content: { kind: "route", url },
});

it("highlights the active frame and independent live views sharing its draft", () => {
  const frames = [
    frame("active", "http://localhost/examples?b=2&a=1&nudge-ui=editor#one"),
    frame("linked", "http://localhost/examples?a=1&b=2#two"),
    frame("other-page", "http://localhost/playground"),
    frame("other-query", "http://localhost/examples?a=2&b=2"),
    frame("other-app", "http://localhost:4000/examples?a=1&b=2"),
  ];

  expect(getLinkedFrameIds(frames, "active")).toEqual(["active", "linked"]);
  expect(getLinkedFrameIds(frames, "linked")).toEqual(["active", "linked"]);
  expect(getLinkedFrameIds(frames, "other-page")).toEqual([]);
});

it("clears the highlight when selection or the active route changes", () => {
  const frames = [frame("first", "http://localhost/playground"), frame("second", "http://localhost/playground")];

  expect(getLinkedFrameIds(frames, null)).toEqual([]);
  expect(getLinkedFrameIds(frames, "removed")).toEqual([]);
  expect(getLinkedFrameIds([frames[0]!, frame("second", "http://localhost/examples")], "second")).toEqual([]);
});

it("keeps HTML iterations independent of their live source route", () => {
  const frames = [
    frame("first", "http://localhost/playground"),
    frame("second", "http://localhost/playground"),
    { id: "iteration", content: { kind: "iteration" as const, artifactId: "iteration-id", sourceUrl: "http://localhost/playground" } },
  ];

  expect(getLinkedFrameIds(frames, "first")).toEqual(["first", "second"]);
  expect(getLinkedFrameIds(frames, "iteration")).toEqual([]);
  expect(getLinkedFrameIds([frames[0]!, frames[2]!], "first")).toEqual([]);
});

it("accepts legacy and readable artifact IDs for iteration frames", async () => {
  const { isFrameContent } = await import("./frameContent.ts");
  const origin = window.location.origin;
  const base = { kind: "iteration" as const, sourceUrl: `${origin}/playground` };

  expect(isFrameContent({ ...base, artifactId: "550e8400-e29b-41d4-a716-446655440000" }, origin)).toBe(true);
  expect(isFrameContent({ ...base, artifactId: "landing-page-one-4f3c2a1e" }, origin)).toBe(true);
  expect(isFrameContent({ ...base, artifactId: "../escape" }, origin)).toBe(false);
});

it("models component sheets as a shared components draft with an encoded document URL", async () => {
  const { contentDocumentUrl, contentEditTarget, contentSourceUrl, isFrameContent } = await import("./frameContent.ts");
  const content: FrameContent = { kind: "component", componentId: "src/Button.tsx:Button", name: "Button" };
  const url = `${window.location.origin}/__nudge_ui__/components?component=src%2FButton.tsx%3AButton`;

  expect(contentDocumentUrl(content)).toBe(url);
  expect(contentSourceUrl(content)).toBe(url);
  expect(contentEditTarget(content)).toEqual({ kind: "components" });
  expect(isFrameContent(content, window.location.origin)).toBe(true);
  expect(isFrameContent({ kind: "component", componentId: "", name: "x" }, window.location.origin)).toBe(false);
  expect(getLinkedFrameIds([{ id: "sheet", content }, frame("a", "http://localhost/a")], "sheet")).toEqual([]);
});

describe("flow state frames", () => {
  const binding = { flowId: "f", stateId: "s", flowTitle: "F", label: "S", route: "/a", scenario: {}, steps: [] };

  it("round-trips through validation and refuses a malformed binding", async () => {
    const { isFrameContent } = await import("./frameContent.ts");
    const url = `${window.location.origin}/a`;
    expect(isFrameContent({ kind: "route", url, flowState: binding }, window.location.origin)).toBe(true);
    expect(isFrameContent({ kind: "route", url, flowState: { flowId: "f" } }, window.location.origin)).toBe(false);
  });

  it("edits the page's own draft, and is not linked to its neighbours as a breakpoint", async () => {
    const { contentEditTarget, getLinkedFrameIds } = await import("./frameContent.ts");
    const url = `${window.location.origin}/a`;
    expect(contentEditTarget({ kind: "route", url, flowState: binding })).toEqual(contentEditTarget({ kind: "route", url }));
    const frames = [
      { id: "state", content: { kind: "route" as const, url, flowState: binding } },
      { id: "plain", content: { kind: "route" as const, url } },
      { id: "copy", content: { kind: "route" as const, url } },
    ];
    expect(getLinkedFrameIds(frames, "state")).toEqual([]);
    expect(getLinkedFrameIds(frames, "plain")).toEqual(["plain", "copy"]);
  });

  it("changes revision only when the recipe does", async () => {
    const { flowStateRevision } = await import("./frameContent.ts");
    expect(flowStateRevision(undefined)).toBeNull();
    expect(flowStateRevision({ ...binding, label: "Renamed" })).toBe(flowStateRevision(binding));
    expect(flowStateRevision({ ...binding, route: "/b" })).not.toBe(flowStateRevision(binding));
  });
});
