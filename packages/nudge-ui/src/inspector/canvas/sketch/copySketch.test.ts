import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyImageToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../sketch/raster.ts", () => ({ copyImageToClipboard: mocks.copyImageToClipboard }));
vi.mock("../../ui/Toast.tsx", () => ({ showToast: mocks.showToast }));

import { saveAndCopySketch } from "./copySketch.ts";

const image = new Blob(["png"], { type: "image/png" });

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveAndCopySketch", () => {
  it("resolves only after the clipboard write and announces the copy", async () => {
    mocks.copyImageToClipboard.mockResolvedValue(undefined);
    const save = vi.fn(async () => image);

    await saveAndCopySketch(save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.copyImageToClipboard).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied to clipboard" }));
  });

  it("rejects when the clipboard write fails so the caller can keep the sketch", async () => {
    mocks.copyImageToClipboard.mockRejectedValue(new Error("clipboard unavailable"));
    const save = vi.fn(async () => image);

    await expect(saveAndCopySketch(save))
      .rejects.toThrow("The sketch was saved, but it could not be copied. clipboard unavailable");
    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("rejects with the save error when the sketch cannot be rendered", async () => {
    mocks.copyImageToClipboard.mockResolvedValue(undefined);
    const save = vi.fn(async () => {
      throw new Error("render failed");
    });

    await expect(saveAndCopySketch(save)).rejects.toThrow("render failed");
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
