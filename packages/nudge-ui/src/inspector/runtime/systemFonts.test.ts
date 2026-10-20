import { describe, expect, it, vi } from "vitest";
import { cssFontFamilyName, localFontAccessSource } from "./systemFonts.ts";

function fakeWindow(options: {
  queryLocalFonts?: () => Promise<{ family: string }[]>;
  query?: (descriptor: { name: string }) => Promise<{ state: string }>;
}): Window {
  return {
    ...(options.queryLocalFonts ? { queryLocalFonts: options.queryLocalFonts } : {}),
    navigator: { permissions: { query: options.query ?? (() => Promise.reject(new TypeError("unsupported"))) } },
  } as unknown as Window;
}

describe("localFontAccessSource", () => {
  it("is unavailable without the Local Font Access API", async () => {
    await expect(localFontAccessSource(fakeWindow({})).access()).resolves.toBe("unavailable");
  });

  it("reports the local-fonts permission state", async () => {
    const query = vi.fn(async () => ({ state: "granted" }));
    const source = localFontAccessSource(fakeWindow({ queryLocalFonts: async () => [], query }));

    await expect(source.access()).resolves.toBe("granted");
    expect(query).toHaveBeenCalledWith({ name: "local-fonts" });
  });

  it("lets the call prompt when the permission cannot be queried", async () => {
    const source = localFontAccessSource(fakeWindow({ queryLocalFonts: async () => [] }));

    await expect(source.access()).resolves.toBe("prompt");
  });

  it("returns the family of every face and calls the API on its window", async () => {
    const win = fakeWindow({});
    const queryLocalFonts = vi.fn(async function (this: unknown) {
      expect(this).toBe(win);
      return [{ family: "Avenir Next" }, { family: "Avenir Next" }, { family: "Georgia" }];
    });
    Object.assign(win, { queryLocalFonts });

    await expect(localFontAccessSource(win).families()).resolves.toEqual(["Avenir Next", "Avenir Next", "Georgia"]);
  });
});

describe("cssFontFamilyName", () => {
  it.each([
    ["Georgia", "Georgia"],
    ["Helvetica Neue", '"Helvetica Neue"'],
    ["7 Segment", '"7 Segment"'],
    ["serif", '"serif"'],
    ["System-UI", '"System-UI"'],
    ["--custom", '"--custom"'],
    ['Quote "Sans"', '"Quote \\"Sans\\""'],
    ["Hiragino Sans GB", '"Hiragino Sans GB"'],
    ["ヒラギノ角ゴシック", "ヒラギノ角ゴシック"],
  ])("writes %s as %s", (family, expected) => {
    expect(cssFontFamilyName(family)).toBe(expected);
  });
});
