// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { describeNode } from "./nodeDescription.ts";

describe("describeNode", () => {
  it("joins the tag, id and the first two classes", () => {
    const button = document.createElement("button");
    button.id = "save";
    button.className = "  btn   btn-primary large ";
    expect(describeNode(button)).toBe("button#save.btn.btn-primary");
  });

  it("is just the tag when the element has no id or classes", () => {
    expect(describeNode(document.createElement("section"))).toBe("section");
  });

  it("skips classes on SVG elements, whose className is not a string", () => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon");
    expect(describeNode(icon as unknown as HTMLElement)).toBe("svg");
  });
});
