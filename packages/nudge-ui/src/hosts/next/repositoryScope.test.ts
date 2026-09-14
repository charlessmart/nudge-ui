import { describe, expect, it } from "vitest";
import {
  NUDGE_UI_PACKAGE_DIRECTORIES,
  nudgeUiRepositoryPackagePath,
  nudgeUiRepositoryPackagePattern,
} from "./repositoryScope.ts";

describe("repository package scope", () => {
  it("matches Nudge UI packages on either path separator", () => {
    expect(nudgeUiRepositoryPackagePattern.test("/repo/packages/inspector/src/App.tsx")).toBe(true);
    expect(nudgeUiRepositoryPackagePattern.test("C:\\repo\\packages\\plugin\\src\\App.tsx")).toBe(true);
    expect(nudgeUiRepositoryPackagePattern.test("/repo/packages/ui/src/App.tsx")).toBe(false);
    expect(nudgeUiRepositoryPackagePattern.test("/repo/packages/inspectorish/App.tsx")).toBe(false);
  });

  it("keeps the Turbopack condition path in its Next-facing form", () => {
    // The Next-facing matcher is not a JavaScript RegExp literal: it must not
    // carry the doubled escaping the loader-side pattern needs.
    expect(nudgeUiRepositoryPackagePath.startsWith("[\\/]packages[\\/]")).toBe(true);
    expect(nudgeUiRepositoryPackagePath).not.toContain("\\\\/");
  });

  it("lists each package directory once", () => {
    expect(new Set(NUDGE_UI_PACKAGE_DIRECTORIES).size).toBe(NUDGE_UI_PACKAGE_DIRECTORIES.length);
  });
});
