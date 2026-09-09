import { afterEach, describe, expect, it } from "vitest";
import {
  isNudgeUiDev,
  resolveNudgeUiDev,
  setNudgeUiHostDevFlag,
} from "./devFlag.ts";

describe("resolveNudgeUiDev", () => {
  it("lets an explicit host flag win over any bundler observation", () => {
    expect(resolveNudgeUiDev(true, true)).toBe(true);
    expect(resolveNudgeUiDev(true, false)).toBe(false);
    expect(resolveNudgeUiDev(false, true)).toBe(true);
    expect(resolveNudgeUiDev(undefined, true)).toBe(true);
    expect(resolveNudgeUiDev(undefined, false)).toBe(false);
  });

  it("follows the bundler define when no host flag exists", () => {
    expect(resolveNudgeUiDev(true, undefined)).toBe(true);
    expect(resolveNudgeUiDev(false, undefined)).toBe(false);
  });

  it("fails closed when neither the bundler nor the host declares development", () => {
    expect(resolveNudgeUiDev(undefined, undefined)).toBe(false);
  });
});

describe("isNudgeUiDev", () => {
  afterEach(() => {
    setNudgeUiHostDevFlag(undefined);
  });

  it("follows the vitest-provided Vite define by default", () => {
    // Vitest runs inspector units through Vite, so `import.meta.env.DEV` is
    // defined and true here. This asserts the seam did not break the
    // bundler-defined path that Vite and the standalone build rely on.
    setNudgeUiHostDevFlag(undefined);
    expect(isNudgeUiDev()).toBe(true);
  });

  it("gives a host flag precedence over the bundler define in both directions", () => {
    setNudgeUiHostDevFlag(false);
    expect(isNudgeUiDev()).toBe(false);

    setNudgeUiHostDevFlag(true);
    expect(isNudgeUiDev()).toBe(true);
  });


});
