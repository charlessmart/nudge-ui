import { afterEach, describe, expect, it } from "vitest";
import type { ComponentRuntimeAdapter } from "./types.ts";
import {
  copyRuntimeTarget,
  getHostRuntimeAdapters,
  registerHostRuntimeAdapter,
} from "./runtimeBridge.ts";

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe("host runtime Adapter bridge", () => {
  it("replaces an Adapter for the same framework across module graphs", () => {
    const first = adapter();
    const second = adapter();
    registerHostRuntimeAdapter(first);
    unregister = registerHostRuntimeAdapter(second);
    expect(getHostRuntimeAdapters()).toEqual([second]);
  });

  it("copies only plain prop values across the seam", () => {
    const target = copyRuntimeTarget({
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
      props: {
        label: "Save",
        disabled: false,
        onClick: () => undefined,
        child: { type: "span" },
      },
    });
    expect(target.props).toEqual({ label: "Save", disabled: false });
  });
});

function adapter(): ComponentRuntimeAdapter {
  return {
    framework: "react",
    inspect: () => [],
    replaceOverrides: () => undefined,
  };
}
