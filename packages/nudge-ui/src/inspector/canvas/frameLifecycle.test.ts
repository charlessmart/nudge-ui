import { describe, expect, it, afterEach } from "vitest";
import { frameLifecycle, setFrameLifecycle } from "./frameLifecycle.ts";

describe("frame lifecycle seam", () => {
  afterEach(() => setFrameLifecycle(null));

  it("allows edits and releases nothing when no owner is registered", () => {
    expect(frameLifecycle().canEdit()).toBe(true);
    expect(() => frameLifecycle().release({ kind: "route", url: "http://localhost/" } as never, []))
      .not.toThrow();
  });

  it("delegates edit checks and release to the registered owner", () => {
    const released: unknown[] = [];
    setFrameLifecycle({
      canEdit: () => false,
      release: (content, remaining) => released.push({ content, remaining }),
    });

    expect(frameLifecycle().canEdit()).toBe(false);
    frameLifecycle().release({ kind: "route", url: "http://localhost/" } as never, []);
    expect(released).toHaveLength(1);
  });

  it("returns to the permissive default when the owner unregisters", () => {
    setFrameLifecycle({ canEdit: () => false, release: () => undefined });
    setFrameLifecycle(null);
    expect(frameLifecycle().canEdit()).toBe(true);
  });
});
