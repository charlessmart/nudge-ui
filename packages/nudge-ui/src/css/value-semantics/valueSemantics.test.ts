// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TokenEntry, TokenTable } from "../model/index.ts";
import {
  applyValueEdit,
  interpretValue,
  selectTokens,
} from "./index.ts";

function table(entries: TokenEntry[]): TokenTable {
  return Object.fromEntries(entries.map((entry) => [entry.cssName ?? entry.name, entry]));
}

describe("value-semantics Interface", () => {
  it("interprets supported structure and conservative fallbacks through one operation", () => {
    const radius: TokenEntry = { name: "--radius-ellipse", value: "8px / 4px", source: "theme.css:1" };
    const fields = interpretValue("border-radius", "var(--radius-ellipse)", {
      tokenContext: { table: table([radius]) },
    });

    expect(fields).toEqual([
      expect.objectContaining({
        property: "border-radius",
        tokenName: "--radius-ellipse",
        capability: "raw",
        diagnostic: "unsupported structured value for border-radius",
      }),
    ]);
  });

  it("projects font shorthand resets through the same interpretation", () => {
    const fields = interpretValue("font", "16px Arial", { tokenContext: { table: {} } });
    expect(Object.fromEntries(fields.map((field) => [field.property, field.declaredValue]))).toMatchObject({
      "font-family": "Arial",
      "font-size": "16px",
      "font-style": "normal",
      "font-weight": "normal",
      "line-height": "normal",
    });
  });

  it("selects compatible tokens and applies meaning-preserving edits", () => {
    const red: TokenEntry = { name: "--color-red", value: "#f00", source: "theme.css:1" };
    const blue: TokenEntry = { name: "--color-blue", value: "#00f", source: "theme.css:2" };
    const space: TokenEntry = { name: "--space-2", value: "8px", source: "theme.css:3" };

    expect(selectTokens({ property: "color", entries: [space, blue, red] }).candidates.map(({ entry }) => entry.name))
      .toEqual(["--color-blue", "--color-red"]);
    expect(applyValueEdit({
      kind: "color-token",
      authored: "color-mix(in srgb, var(--color-red) 40%, transparent)",
      currentToken: red,
      nextToken: blue,
    })).toEqual({
      ok: true,
      value: "color-mix(in srgb, var(--color-blue) 40%, transparent)",
    });
  });

  it("does not throw for arbitrary authored input", () => {
    expect(() => interpretValue("--unknown", "')/* arbitrary", { tokenContext: { table: {} } })).not.toThrow();
  });
});
