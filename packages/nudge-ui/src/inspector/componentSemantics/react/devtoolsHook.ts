import type { Fiber, FiberProps } from "./fibers.ts";

/**
 * React development builds hand this toolkit to `__REACT_DEVTOOLS_GLOBAL_HOOK__`
 * when the renderer loads. It is the private seam React DevTools edits props
 * through; React 16 through 19 ship it, so it is read defensively and its
 * absence only removes live preview.
 */
export interface ReactRendererInternals {
  /** An empty path replaces the whole props object, which is the only form used here. */
  overrideProps?: (fiber: Fiber, path: [], value: FiberProps) => void;
}

/** React passes the scheduler priority and an error flag after the root. */
type CommitDetails = Array<number | boolean | undefined>;

interface ReactDevtoolsHook {
  renderers?: Map<number, ReactRendererInternals>;
  onCommitFiberRoot?: (rendererId: number, root: FiberRoot, ...details: CommitDetails) => void;
  [COMMIT_OBSERVER]?: CommitObserver;
}

interface GlobalWithHook {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook | null;
}

export interface FiberRoot {
  current?: Fiber | null;
}

const COMMIT_OBSERVER: unique symbol = Symbol.for("nudge-ui.react-commit-observer");

interface CommitObserver {
  readonly roots: Map<FiberRoot, number>;
  readonly listeners: Set<(root: FiberRoot) => void>;
}

function hook(): ReactDevtoolsHook | null {
  // SAFETY: the global is absent or a hook object installed by React Refresh,
  // React DevTools, or the capture script; members are checked before use.
  const value = (globalThis as typeof globalThis & GlobalWithHook).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  return typeof value === "object" && value !== null ? value : null;
}

/** The renderer that can edit props for a root, or any capable renderer when the root is unknown. */
export function propEditingRenderer(root?: FiberRoot): ReactRendererInternals | null {
  const renderers = hook()?.renderers;
  if (!(renderers instanceof Map)) return null;
  const rendererId = root ? commitObserver()?.roots.get(root) : undefined;
  const preferred = rendererId === undefined ? undefined : renderers.get(rendererId);
  if (typeof preferred?.overrideProps === "function") return preferred;
  for (const renderer of renderers.values()) {
    if (typeof renderer?.overrideProps === "function") return renderer;
  }
  return null;
}

/**
 * Observes commits through the hook once per realm. Roots are recorded so
 * the runtime can walk mounted trees without a DOM query.
 */
function commitObserver(): CommitObserver | null {
  const target = hook();
  if (!target) return null;
  const existing = target[COMMIT_OBSERVER];
  if (existing) return existing;
  const observer: CommitObserver = { roots: new Map(), listeners: new Set() };
  const previous = target.onCommitFiberRoot;
  target.onCommitFiberRoot = function onCommitFiberRoot(rendererId, root, ...details) {
    if (typeof previous === "function") previous.call(this, rendererId, root, ...details);
    if (root && typeof root === "object") {
      observer.roots.set(root, rendererId);
      for (const listener of observer.listeners) listener(root);
    }
  };
  target[COMMIT_OBSERVER] = observer;
  return observer;
}

/** True once commits are observable, which needs a hook on the page. */
export function trackedRootsAvailable(): boolean {
  return commitObserver() !== null;
}

export function trackedRoots(): FiberRoot[] {
  return [...(commitObserver()?.roots.keys() ?? [])];
}

/** Records a root found from the DOM, for trees that committed before observation began. */
export function rememberRoot(root: FiberRoot): void {
  const observer = commitObserver();
  if (observer && !observer.roots.has(root)) observer.roots.set(root, -1);
}

export function onCommit(listener: (root: FiberRoot) => void): () => void {
  const observer = commitObserver();
  if (!observer) return () => undefined;
  observer.listeners.add(listener);
  return () => observer.listeners.delete(listener);
}
