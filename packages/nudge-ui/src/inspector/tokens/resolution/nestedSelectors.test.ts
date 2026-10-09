import { describe, expect, it } from "vitest";
import { computeSpecificityCore } from "./selectorSemantics.ts";
import { resolveNestedSelector } from "./nestedSelectors.ts";

describe("nested selector resolution", () => {
  it("keeps interaction selectors scoped to their parent utility", () => {
    expect(resolveNestedSelector("&:disabled", ".disabled\\:opacity-0"))
      .toBe(":is(.disabled\\:opacity-0):disabled");
  });

  it("resolves explicit and implicit nesting separately in each selector branch", () => {
    expect(resolveNestedSelector("&:hover, > .label, .icon", ".button, #primary"))
      .toBe(":is(.button, #primary):hover, :is(.button, #primary) > .label, :is(.button, #primary) .icon");
  });

  it("preserves the strongest parent specificity for every repeated nesting selector", () => {
    const selector = resolveNestedSelector("& + &", ".button, #primary");
    expect(selector).toBe(":is(.button, #primary) + :is(.button, #primary)");
    expect(computeSpecificityCore(selector)).toBe(2_000_000);
  });

  it("resolves nesting inside selector functions without splitting their arguments", () => {
    expect(resolveNestedSelector(":is(&, .other) > .label", ".button"))
      .toBe(":is(:is(.button), .other) > .label");
  });

  it("preserves literal ampersands and commas in attributes, escapes, and comments", () => {
    expect(resolveNestedSelector('&[data-label="&, other"], .icon\\& /* & */', ".button"))
      .toBe(':is(.button)[data-label="&, other"], :is(.button) .icon\\& /* & */');
  });
});
