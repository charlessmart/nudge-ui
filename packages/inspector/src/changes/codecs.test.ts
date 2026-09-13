import { describe, expect, it } from "vitest";
import type { TokenEntry } from "virtual:design-tokens";
import { makeComponentChange } from "./_testUtils.ts";
import {
  deserializeChange,
  isSerializableChange,
  serializeChange,
} from "./codecs.ts";
import type { ChangeRecord, ElementChangeRecord, TokenChangeRecord } from "./types.ts";
import type { TextContentChangeRecord } from "./editModel.ts";

const renderedInstanceOverride = {
  id: "override-1",
  target: {
    sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
    locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Save" },
  },
};

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

function makeElementChange(): ElementChangeRecord {
  return {
    kind: "element",
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property: "background",
    oldToken: COLOR_A,
    newToken: COLOR_B,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
    scope: "source-site",
  };
}

function makeTokenChange(): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: "--color-surface",
    file: "src/theme.css",
    line: 4,
    selector: ":root",
    property: "--color-surface",
    rawValue: "#bbbbbb",
    oldRawValue: "#aaaaaa",
    context: {},
    contextLabel: ":root",
    source: { file: "src/theme.css", line: 4, component: "Global token" },
  };
}

function makeTextChange(): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: "text-1",
    target: {
      sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
      occurrence: 0,
      props: null,
      ariaLabel: null,
      beforeText: "Original",
    },
    source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
    selector: '[data-cid="Copy"]',
    before: "Original",
    after: "Updated",
    authoredAs: "literal",
    scope: "source-site",
  };
}

describe("change codecs", () => {
  it.each([
    ["element", makeElementChange()],
    ["token", makeTokenChange()],
    ["component-prop", makeComponentChange()],
    ["text-content", makeTextChange()],
  ] as const)("round-trips %s intent without storage dependencies", (_kind, change) => {
    const serialized = serializeChange(change);

    expect(serialized).not.toBeNull();
    expect(isSerializableChange(serialized)).toBe(true);
    expect(deserializeChange(serialized!)).toEqual(change);
  });

  it("rejects transient fields and malformed component targets", () => {
    const element = serializeChange(makeElementChange())!;
    const component = serializeChange(makeComponentChange())!;

    expect(isSerializableChange({ ...element, previewResult: { status: "applied" } })).toBe(false);
    expect(isSerializableChange({ ...component, target: null })).toBe(false);
  });

  it("rejects an instance override without rendered-instance scope", () => {
    const serialized = serializeChange(makeElementChange())!;

    expect(isSerializableChange({ ...serialized, instanceOverride: renderedInstanceOverride })).toBe(false);
    expect(isSerializableChange({
      ...serialized,
      scope: undefined,
      instanceOverride: renderedInstanceOverride,
    })).toBe(false);
    expect(serializeChange({
      ...makeElementChange(),
      instanceOverride: renderedInstanceOverride,
    })).toBeNull();
  });

  it("does not persist an unsafe repeated source-site prop edit", () => {
    const change = makeComponentChange({
      authoredAs: "expression",
      scope: "source-site",
      evidence: {
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "primary",
        mountedCount: 2,
      },
    });

    expect(serializeChange(change)).toBeNull();
  });
});
