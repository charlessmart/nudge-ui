// @vitest-environment jsdom
import { expect, it } from "vitest";
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
