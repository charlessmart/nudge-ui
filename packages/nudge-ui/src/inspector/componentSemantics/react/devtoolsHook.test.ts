import { afterEach, describe, expect, it } from "vitest";
import { onCommit, propEditingRenderer, rememberRoot, type FiberRoot, type ReactRendererInternals } from "./devtoolsHook.ts";

interface TestHook {
  renderers: Map<number, ReactRendererInternals>;
  onCommitFiberRoot?: (rendererId: number, root: FiberRoot) => void;
}

function installHook(renderers: Array<[number, ReactRendererInternals]>): TestHook {
  const hook: TestHook = { renderers: new Map(renderers), onCommitFiberRoot: () => undefined };
  Reflect.set(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", hook);
  // Subscribing installs the commit observer, as the runtime does on registration.
  onCommit(() => undefined);
  return hook;
}

const editing = (): ReactRendererInternals => ({ overrideProps: () => undefined });
const production = (): ReactRendererInternals => ({});

describe("propEditingRenderer", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__");
  });

  it("uses only the renderer that committed a root", () => {
    const owner = editing();
    const hook = installHook([[0, editing()], [1, owner]]);
    const root: FiberRoot = { current: null };
    hook.onCommitFiberRoot?.(1, root);

    expect(propEditingRenderer(root)).toBe(owner);
  });

  it("never borrows another renderer when the owner cannot edit props", () => {
    const hook = installHook([[0, editing()], [1, production()]]);
    const root: FiberRoot = { current: null };
    hook.onCommitFiberRoot?.(1, root);

    expect(propEditingRenderer(root)).toBeNull();
  });

  it("resolves an unknown owner only when one renderer can edit props", () => {
    const only = editing();
    installHook([[0, only], [1, production()]]);
    const root: FiberRoot = { current: null };
    rememberRoot(root);
    expect(propEditingRenderer(root)).toBe(only);

    installHook([[0, editing()], [1, editing()]]);
    const ambiguous: FiberRoot = { current: null };
    rememberRoot(ambiguous);
    expect(propEditingRenderer(ambiguous)).toBeNull();
  });
});
