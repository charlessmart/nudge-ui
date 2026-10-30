import { afterEach, describe, expect, it, vi } from "vitest";
import { isAddPageEnabled } from "./features.ts";

function stubStoredValue(value: string | null): void {
  vi.stubGlobal("localStorage", { getItem: () => value });
}

describe("isAddPageEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off when the key is unset", () => {
    stubStoredValue(null);
    expect(isAddPageEnabled()).toBe(false);
  });

  it("is on only for the opt-in value", () => {
    stubStoredValue("1");
    expect(isAddPageEnabled()).toBe(true);
    stubStoredValue("0");
    expect(isAddPageEnabled()).toBe(false);
  });

  it("fails closed when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(isAddPageEnabled()).toBe(false);
  });
});
