// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyToClipboard } from "./copyToClipboard.ts";

interface NavigatorWithClipboard {
  clipboard?: { writeText: (text: string) => Promise<void> };
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  const nav = navigator as NavigatorWithClipboard;
  if (writeText) {
    nav.clipboard = { writeText };
  } else {
    delete nav.clipboard;
  }
}

function stubExecCommand(returns: boolean): void {
  document.execCommand = vi.fn(() => returns) as unknown as typeof document.execCommand;
}

describe("copyToClipboard", () => {
  beforeEach(() => {
    (navigator as NavigatorWithClipboard).clipboard = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (navigator as NavigatorWithClipboard).clipboard = undefined;
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn((t: string) => Promise.resolve());
    setClipboard(writeText);
    await copyToClipboard("hello");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when navigator.clipboard is undefined", async () => {
    setClipboard(undefined);
    stubExecCommand(true);
    await copyToClipboard("fallback");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.execCommand).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when clipboard.writeText rejects", async () => {
    setClipboard(() => Promise.reject(new Error("denied")));
    stubExecCommand(true);
    await copyToClipboard("after-reject");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws on hard failure when execCommand returns false", async () => {
    setClipboard(undefined);
    stubExecCommand(false);
    await expect(copyToClipboard("hard-fail")).rejects.toThrow();
  });
});
