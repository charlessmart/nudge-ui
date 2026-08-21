import { afterEach, describe, expect, it } from "vitest";
import {
  isDesignToolDev,
  resolveDesignToolDev,
  setDesignToolHostDevFlag,
} from "./devFlag.ts";

describe("resolveDesignToolDev", () => {
  it("lets an explicit host flag win over any bundler observation", () => {
    expect(resolveDesignToolDev(true, true)).toBe(true);
    expect(resolveDesignToolDev(true, false)).toBe(false);
    expect(resolveDesignToolDev(false, true)).toBe(true);
    expect(resolveDesignToolDev(undefined, true)).toBe(true);
    expect(resolveDesignToolDev(undefined, false)).toBe(false);
  });

  it("follows the bundler define when no host flag exists", () => {
    expect(resolveDesignToolDev(true, undefined)).toBe(true);
    expect(resolveDesignToolDev(false, undefined)).toBe(false);
  });

  it("fails closed when neither the bundler nor the host declares development", () => {
    expect(resolveDesignToolDev(undefined, undefined)).toBe(false);
  });
});

describe("isDesignToolDev", () => {
  afterEach(() => {
    setDesignToolHostDevFlag(undefined);
  });

  it("follows the vitest-provided Vite define by default", () => {
    // Vitest runs inspector units through Vite, so `import.meta.env.DEV` is
    // defined and true here. This asserts the seam did not break the
    // bundler-defined path that Vite and the standalone build rely on.
    setDesignToolHostDevFlag(undefined);
    expect(isDesignToolDev()).toBe(true);
  });

  it("gives a host flag precedence over the bundler define in both directions", () => {
    setDesignToolHostDevFlag(false);
    expect(isDesignToolDev()).toBe(false);

    setDesignToolHostDevFlag(true);
    expect(isDesignToolDev()).toBe(true);
  });

  it("restores bundler authority when the host flag is cleared", () => {
    setDesignToolHostDevFlag(false);
    expect(isDesignToolDev()).toBe(false);

    setDesignToolHostDevFlag(undefined);
    expect(isDesignToolDev()).toBe(true);
  });
});
