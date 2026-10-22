// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { describeElement } from "./elementName.ts";

describe("describeElement", () => {
  it("names the tag and its accessible name, with the markup detail when it adds an id or class", () => {
    const link = document.createElement("a");
    link.id = "signup";
    link.className = "cta primary";
    link.setAttribute("aria-label", "Create account");
    expect(describeElement(link)).toEqual({ title: "Link · Create account", detail: "a#signup.cta.primary" });
  });

  it("leaves the detail out when the markup name would only repeat the title", () => {
    expect(describeElement(document.createElement("body"))).toEqual({ title: "Page" });
    expect(describeElement(document.createElement("section"))).toEqual({ title: "Section" });
  });
});
