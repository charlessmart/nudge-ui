// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mirrorEditorAddress } from "./editorAddress.ts";

describe("mirrorEditorAddress", () => {
  afterEach(() => vi.restoreAllMocks());

  it("puts a same-origin page in the address bar as an editor URL", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    mirrorEditorAddress(`${window.location.origin}/playground`);
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", `${window.location.origin}/playground?nudge-ui=editor`);
  });

  it("skips a page captured on another origin, such as a previous dev port", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    expect(() => mirrorEditorAddress("http://localhost:1/playground")).not.toThrow();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("skips a source URL that is empty or not an application page", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    expect(() => mirrorEditorAddress("")).not.toThrow();
    expect(() => mirrorEditorAddress("about:blank")).not.toThrow();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
