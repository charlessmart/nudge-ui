// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  inspectComponentTargets,
  registerComponentRuntimeAdapter,
} from "./adapterRegistry.ts";
import type { ComponentRuntimeAdapter, RuntimeComponentTarget } from "./types.ts";

describe("inspectComponentTargets", () => {
  it("skips malformed Adapter results without losing valid targets", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const validTarget = target();
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => [
        // SAFETY: malformed cross-seam data is the behavior under test.
        { framework: "react", meta: null, props: {} } as never,
        validTarget,
      ],
      replaceOverrides: () => undefined,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);

    try {
      expect(inspectComponentTargets(document.createElement("button"))).toEqual([validTarget]);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      unregister();
      warning.mockRestore();
    }
  });

  it("keeps DOM inspection available when an Adapter throws", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => {
        throw new Error("third-party inspection failed");
      },
      replaceOverrides: () => undefined,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);

    try {
      expect(inspectComponentTargets(document.createElement("button"))).toEqual([]);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("third-party inspection failed"),
      );
    } finally {
      unregister();
      warning.mockRestore();
    }
  });
});

function target(): RuntimeComponentTarget {
  return {
    framework: "react",
    meta: {
      callsiteId: "src/App.tsx:1:1",
      componentId: "src/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 1,
      column: 1,
      authoredProps: { label: "literal" },
    },
    props: { label: "Save" },
  };
}
