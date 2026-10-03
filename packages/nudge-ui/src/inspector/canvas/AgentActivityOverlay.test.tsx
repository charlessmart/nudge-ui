// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { attributeActivity } from "./AgentActivityOverlay.tsx";
import type { ActivityFile } from "../agent/activity.ts";
const edit = (file: string, line?: number, endLine?: number): ActivityFile => ({ requestId: "request", operation: "edit", file, ...(line ? { line } : {}), ...(endLine ? { endLine } : {}), expiresAt: 12_000 });

describe("rendered source activity attribution", () => {
  it("decorates every matching frame and narrows shimmer to the edited source range", () => {
    const document = new DOMParser().parseFromString('<div data-src="src/Card.tsx:10:1" data-cid="Card"><span data-src="src/Card.tsx:11:1">Title</span></div><footer data-src="src/Footer.tsx:10:1"></footer>', "text/html");
    const file = edit("src/Card.tsx", 10, 11);
    const attribution = attributeActivity({ kind: "route", url: "http://localhost/" }, document, [file]);
    expect(attribution.files).toEqual([file]);
    expect(attribution.elements.map((element) => element.tagName)).toEqual(["DIV"]);
    expect(attributeActivity({ kind: "route", url: "http://localhost/about" }, document, [edit("src/Card.tsx", 11)]).elements.map((element) => element.tagName)).toEqual(["SPAN"]);
  });
  it("shows reads on frames without suggesting a component edit", () => {
    const document = new DOMParser().parseFromString('<div data-src="src/Card.tsx:10:1"></div>', "text/html");
    const file = { ...edit("src/Card.tsx"), operation: "read" as const };
    expect(attributeActivity({ kind: "route", url: "http://localhost/" }, document, [file])).toEqual({ files: [file], elements: [] });
  });
  it("targets study files independently of their captured application source", () => {
    const document = new DOMParser().parseFromString('<div data-src="src/Card.tsx:10:1"></div>', "text/html");
    const content = { kind: "study" as const, sourceUrl: "http://localhost/", artifactId: "study-1" };
    const file = edit(".nudge/artifacts/study-1/document.html");
    expect(attributeActivity(content, document, [edit("src/Card.tsx"), file])).toEqual({ files: [file], elements: [] });
  });
});
