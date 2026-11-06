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

