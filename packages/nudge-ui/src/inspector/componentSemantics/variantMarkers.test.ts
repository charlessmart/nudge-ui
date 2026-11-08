import { describe, expect, it } from "vitest";
import type { ComponentContract } from "./types.ts";
import {
  describeVariantScope,
  parseVariantTokens,
  scopeSelectorToVariant,
  variantScopeSelector,
  variantToken,
  variantTokensForProps,
} from "./variantMarkers.ts";

const contract: ComponentContract = {
  componentId: "src/ds/Button#Button",
  name: "Button",
  file: "src/ds/Button.tsx",
  provenance: "typescript",
  props: [
    { name: "variant", control: "select", options: ["primary", "secondary"], optional: true },
    { name: "size", control: "select", options: ["sm", "md"], optional: true },
    { name: "loading", control: "boolean", options: [], optional: true },
    { name: "children", control: "text", options: [], optional: true },
  ],
};

describe("variant markers", () => {
  it("encodes whitespace, quotes and backslashes so a token stays one selector-safe word", () => {
    const token = variantToken("Button", "label", 'a b"c\'d\\e');
    expect(token).not.toMatch(/[\s"'\\]/);
    expect(parseVariantTokens("Button", token)).toEqual({ label: 'a b"c\'d\\e' });
  });

  it("marks select and boolean props that were passed, and nothing else", () => {
    expect(variantTokensForProps(contract, { variant: "primary", loading: true, children: "Hi", extra: 1 }))
      .toEqual(["Button.loading=true", "Button.variant=primary"]);
    expect(variantTokensForProps(contract, {})).toEqual([]);
  });

  it("falls back to contract defaults for omitted props", () => {
    const withDefaults: ComponentContract = {
      ...contract,
      props: contract.props.map((prop) =>
        prop.name === "variant" ? { ...prop, defaultValue: "primary" }
          : prop.name === "loading" ? { ...prop, defaultValue: false }
            : prop),
    };
    expect(variantTokensForProps(withDefaults, {})).toEqual(["Button.loading=false", "Button.variant=primary"]);
    expect(variantTokensForProps(withDefaults, { variant: "secondary" }))
      .toEqual(["Button.loading=false", "Button.variant=secondary"]);
  });

  it("builds a selector matching the marked node and everything below it", () => {
    const scope = { componentName: "Button", props: { variant: "primary", size: "sm" } };
    const marked = '[data-nudge-ui-variant~="Button.size=sm"][data-nudge-ui-variant~="Button.variant=primary"]';
    expect(variantScopeSelector(scope)).toBe(`:is(${marked}, ${marked} *)`);
    expect(scopeSelectorToVariant('[data-cid="B"][data-src="f:1:2"]:hover', scope))
      .toBe(`:is([data-src="f:1:2"], [data-nudge-def="f:1:2"]):is(${marked}, ${marked} *):hover`);
    const once = scopeSelectorToVariant('[data-cid="B"][data-src="f:1:2"]', scope);
    expect(scopeSelectorToVariant(once, scope)).toBe(once);
    expect(scopeSelectorToVariant(".plain", scope)).toBe(".plain");
    expect(describeVariantScope(scope)).toBe("Button size=sm, variant=primary");
  });
});
