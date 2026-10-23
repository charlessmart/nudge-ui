import type { Fiber, FiberProps } from "./fibers.ts";

/** The private seam React DevTools edits props through; read defensively because it is not public API. */
export interface ReactRendererInternals {
  /** An empty path replaces the whole props object, which is the only form used here. */
  overrideProps?: (fiber: Fiber, path: [], value: FiberProps) => void;
}

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
  /** Each root with the renderer that committed it; -1 for a root found from the DOM before any commit. */
  readonly roots: Map<FiberRoot, number>;
  readonly listeners: Set<(root: FiberRoot) => void>;
  /** Counts commits, so callers can tell whether a mounted tree may have changed. */
  generation: number;
}

function hook(): ReactDevtoolsHook | null {
  // SAFETY: the global is absent or a hook object installed by React Refresh, React DevTools, or the capture script; members are checked before use.
  const value = (globalThis as typeof globalThis & GlobalWithHook).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  return typeof value === "object" && value !== null ? value : null;
}

/** A fiber must only be edited by its own renderer: a known owner without the toolkit (a production build) answers null rather than borrowing another copy's; an unknown owner resolves only when exactly one capable renderer exists. */
export function propEditingRenderer(root?: FiberRoot): ReactRendererInternals | null {
  const renderers = hook()?.renderers;
  if (!(renderers instanceof Map)) return null;
  const rendererId = root ? commitObserver()?.roots.get(root) : undefined;
  if (rendererId !== undefined && rendererId >= 0) {
    const owner = renderers.get(rendererId);
    return typeof owner?.overrideProps === "function" ? owner : null;
  }
  const capable = [...renderers.values()].filter((renderer) => typeof renderer?.overrideProps === "function");
  return capable.length === 1 ? capable[0]! : null;
}

/** Observes commits through the hook once per realm; roots are recorded so the runtime can walk mounted trees without a DOM query. */
function commitObserver(): CommitObserver | null {
  const target = hook();
  if (!target) return null;
  const existing = target[COMMIT_OBSERVER];
  if (existing) return existing;
  const observer: CommitObserver = { roots: new Map(), listeners: new Set(), generation: 0 };
  const previous = target.onCommitFiberRoot;
  target.onCommitFiberRoot = function onCommitFiberRoot(rendererId, root, ...details) {
    if (typeof previous === "function") previous.call(this, rendererId, root, ...details);
    observer.generation += 1;
    if (root && typeof root === "object") {
      observer.roots.set(root, rendererId);
      for (const listener of observer.listeners) listener(root);
    }
  };
  target[COMMIT_OBSERVER] = observer;
  return observer;
}

/** Commits seen so far, or null when commits cannot be observed. */
export function commitGeneration(): number | null {
  return commitObserver()?.generation ?? null;
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
