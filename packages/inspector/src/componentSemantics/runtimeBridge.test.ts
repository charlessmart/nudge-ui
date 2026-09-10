import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentRuntimeAdapter } from "./types.ts";
import {
  copyRuntimeTarget,
  getHostRuntimeAdapters,
  registerHostRuntimeAdapter,
  replaceHostRuntimeAdapterOverrides,
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

  it("replays the latest override projection when an Adapter registers", () => {
    replaceHostRuntimeAdapterOverrides([{
      framework: "react",
      callsiteId: "src/App.tsx:1:1",
      prop: "disabled",
      value: true,
    }]);
    const replaceOverrides = vi.fn();
    unregister = registerHostRuntimeAdapter({ ...adapter(), replaceOverrides });
    expect(replaceOverrides).toHaveBeenCalledWith([{
      framework: "react",
      callsiteId: "src/App.tsx:1:1",
      prop: "disabled",
      value: true,
    }]);
  });

  it("rejects an incompatible page-global registry", () => {
    const key = Symbol.for("nudge-ui.host-runtime.v1");
    const host = globalThis as unknown as Record<PropertyKey, unknown>;
    const current = host[key];
    host[key] = { version: 2, adapters: new Map(), overrides: new Map() };
    try {
      expect(() => getHostRuntimeAdapters()).toThrow(/incompatible with version 1/);
    } finally {
      host[key] = current;
    }
  });

  it("rejects malformed component targets from an Adapter", () => {
    expect(() => copyRuntimeTarget({
      framework: "react",
      meta: null,
      props: {},
    } as never)).toThrow(/invalid component target/);
  });
});

function adapter(): ComponentRuntimeAdapter {
  return {
    framework: "react",
    inspect: () => [],
    replaceOverrides: () => undefined,
  };
}
