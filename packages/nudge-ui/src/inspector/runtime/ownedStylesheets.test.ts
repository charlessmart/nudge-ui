// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { allowsStyleElements } from "./ownedStylesheets.ts";

function documentWithHead(): Document {
  return document.implementation.createHTMLDocument("policy");
}

describe("allowsStyleElements", () => {
  it("reports style elements as allowed when the browser creates their sheet", () => {
    expect(allowsStyleElements(document)).toBe(true);
    expect(document.querySelector("[data-nudge-ui=style-policy-probe]")).toBeNull();
  });

  it("reports style elements as blocked when the policy leaves them without a sheet", () => {
    const doc = documentWithHead();
    const sheet = vi.spyOn(doc.defaultView?.HTMLStyleElement.prototype ?? HTMLStyleElement.prototype, "sheet", "get")
      .mockReturnValue(null);

    try {
      expect(allowsStyleElements(doc)).toBe(false);
    } finally {
      sheet.mockRestore();
    }
  });

  it("checks each document once", () => {
    const doc = documentWithHead();
    const append = vi.spyOn(doc.head, "appendChild");

    allowsStyleElements(doc);
    allowsStyleElements(doc);

    expect(append).toHaveBeenCalledTimes(1);
  });
});
