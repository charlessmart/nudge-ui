import type { ComponentInvocationMeta, ComponentRootInvocation } from "./types.ts";
import { HOST_ROOT_TAG, hostOutputCount, isHostOutput, type Fiber, type FiberProps } from "./reactFibers.ts";
import {
  onCommit,
  propEditingRenderer,
  rememberRoot,
  trackedRoots,
  trackedRootsAvailable,
  type FiberRoot,
  type ReactRendererInternals,
} from "./reactDevtoolsHook.ts";

/**
 * Semantic identity for callsites the compiler did not wrap.
 *
 * Every instrumented JSX callsite already carries `data-src` as a prop, and
 * React keeps that prop on the component's fiber whether or not the component
 * forwards it to the DOM. The compiler registers each unwrapped callsite's
 * metadata here, so the runtime can name a component from its fiber without
 * replacing the element type. Live preview edits those fibers' props through
 * React's DevTools seam; without that seam the same targets stay readable and
 * edits reach the prompt only.
 */

const IDENTITY_PROPS = new Set(["data-cid", "data-src", "data-cprops"]);
const callsites = new Map<string, ComponentInvocationMeta>();
let overridesByCallsite = new Map<string, FiberProps>();

export interface TaggedInvocation {
  meta: ComponentInvocationMeta;
  fiber: Fiber;
  /** Distance above the inspected host fiber, for ordering against boundaries. */
  depth: number;
  root: FiberRoot | null;
}

/** Called from transformed modules before any of their JSX renders. */
export function registerReactCallsites(metas: readonly ComponentInvocationMeta[]): void {
  for (const meta of metas) callsites.set(meta.callsiteId, meta);
  treeGeneration += 1;
  observeCommits();
}

function taggedCallsite(fiber: Fiber): ComponentInvocationMeta | null {
  if (isHostOutput(fiber)) return null;
  const src = fiber.memoizedProps?.["data-src"];
  return typeof src === "string" ? callsites.get(src) ?? null : null;
}

export function invocationProps(fiber: Fiber): FiberProps {
  const props: Record<keyof FiberProps, FiberProps[string]> = {};
  for (const [name, value] of Object.entries(fiber.memoizedProps ?? {})) {
    if (!IDENTITY_PROPS.has(name)) props[name] = value;
  }
  return props;
}

/**
 * A DOM node can point into the tree React is not currently showing. The
 * HostRoot at the top of the walk says which tree it is; fibers from the
 * other tree are swapped for their current counterparts.
 */
interface TreePosition {
  root: FiberRoot | null;
  /** False when the fibers reached belong to React's alternate (not displayed) tree. */
  onCurrentTree: boolean;
}

function resolveRoot(host: Fiber): TreePosition {
  let top: Fiber = host;
  while (top.return) top = top.return;
  if (top.tag !== HOST_ROOT_TAG) return { root: null, onCurrentTree: true };
  // SAFETY: a HostRoot fiber's stateNode is its FiberRoot; it is checked to be an object below.
  const root = top.stateNode as FiberRoot | null | undefined;
  if (!root || typeof root !== "object") return { root: null, onCurrentTree: true };
  rememberRoot(root);
  return { root, onCurrentTree: root.current === top };
}

function current(fiber: Fiber, onCurrentTree: boolean): Fiber {
  return onCurrentTree ? fiber : fiber.alternate ?? fiber;
}

/**
 * Nearest invocation first. One callsite can span several fibers (memo and
 * forwardRef layers, or a component spreading its props into another); with
 * no host output between them they are one invocation, owned by the
 * outermost layer. A repeat further up is a recursive instance and the
 * nearest one wins.
 */
export function taggedInvocationsAbove(host: Fiber): TaggedInvocation[] {
  if (callsites.size === 0) return [];
  const { root, onCurrentTree } = resolveRoot(host);
  const found = new Map<string, TaggedInvocation>();
  let chain: string | null = null;
  let depth = 0;
  for (let fiber = host.return ?? null; fiber; fiber = fiber.return ?? null) {
    depth += 1;
    if (isHostOutput(fiber)) {
      chain = null;
      continue;
    }
    const meta = taggedCallsite(fiber);
    if (!meta) continue;
    const existing = found.get(meta.callsiteId);
    if (existing && chain === meta.callsiteId) {
      existing.fiber = current(fiber, onCurrentTree);
    } else if (!existing) {
      found.set(meta.callsiteId, { meta, fiber: current(fiber, onCurrentTree), depth, root });
      chain = meta.callsiteId;
    } else {
      chain = null;
    }
  }
  return [...found.values()];
}

/** Invocations whose entire rendered output is this host fiber, nearest first. */
export function taggedRootInvocations(host: Fiber): Array<ComponentRootInvocation & { depth: number }> {
  if (callsites.size === 0) return [];
  const invocations: Array<ComponentRootInvocation & { depth: number }> = [];
  const seen = new Set<string>();
  let depth = 0;
  for (let fiber = host.return ?? null; fiber && !isHostOutput(fiber); fiber = fiber.return ?? null) {
    depth += 1;
    const meta = taggedCallsite(fiber);
    if (!meta || seen.has(meta.callsiteId)) continue;
    if (hostOutputCount(fiber) !== 1) break;
    seen.add(meta.callsiteId);
    invocations.push({ callsiteId: meta.callsiteId, componentName: meta.componentName, depth });
  }
  return invocations;
}

/**
 * A mounted tree only changes at a commit, so while commits are observed one
 * walk per root serves every inspection until the next one. Registration
 * also invalidates, because it changes which fibers count as callsites.
 */
let treeGeneration = 0;
const walkedRoots = new WeakMap<FiberRoot, { generation: number; invocations: Map<string, Fiber[]> }>();

/** Outermost fiber of every mounted invocation, grouped by callsite, top-down. */
function mountedInvocations(roots: Iterable<FiberRoot>): Map<string, Fiber[]> {
  const merged = new Map<string, Fiber[]>();
  for (const root of roots) {
    const cached = walkedRoots.get(root);
    const invocations = stopObserving && cached?.generation === treeGeneration
      ? cached.invocations
      : walkRoot(root);
    if (stopObserving) walkedRoots.set(root, { generation: treeGeneration, invocations });
    for (const [callsiteId, fibers] of invocations) {
      merged.set(callsiteId, [...(merged.get(callsiteId) ?? []), ...fibers]);
    }
  }
  return merged;
}

function walkRoot(root: FiberRoot): Map<string, Fiber[]> {
  const invocations = new Map<string, Fiber[]>();
  const top = root.current;
  if (!top) return invocations;
  const stack: Array<[Fiber, string | null]> = [[top, null]];
  while (stack.length > 0) {
    const [fiber, chain] = stack.pop()!;
    let next = chain;
    if (isHostOutput(fiber)) {
      next = null;
    } else {
      const meta = taggedCallsite(fiber);
      if (meta && meta.callsiteId !== chain) {
        const list = invocations.get(meta.callsiteId) ?? [];
        list.push(fiber);
        invocations.set(meta.callsiteId, list);
        next = meta.callsiteId;
      }
    }
    for (let child = fiber.child ?? null; child; child = child.sibling ?? null) {
      stack.push([child, next]);
    }
  }
  return invocations;
}

function rootsIncluding(root: FiberRoot | null): FiberRoot[] {
  const roots = trackedRoots();
  return root && !roots.includes(root) ? [...roots, root] : roots;
}

export function taggedCallsiteMultiplicity(callsiteId: string, root: FiberRoot | null = null): number | null {
  if (!callsites.has(callsiteId)) return null;
  const count = mountedInvocations(rootsIncluding(root)).get(callsiteId)?.length ?? 0;
  return count > 0 ? count : null;
}

export function canPreviewLive(root: FiberRoot | null): boolean {
  return propEditingRenderer(root ?? undefined) !== null;
}

interface AuthoredValue {
  present: boolean;
  value: unknown;
}

/**
 * The authored value a prop had before it was overridden, per mounted
 * invocation. It is refreshed whenever a parent render hands the authored
 * value back, so restoring never resurrects a stale one. Both fibers of an
 * invocation share the record because React alternates between them.
 */
const authoredValues = new WeakMap<Fiber, Map<string, AuthoredValue>>();

function authoredFor(fiber: Fiber): Map<string, AuthoredValue> {
  const existing = authoredValues.get(fiber) ?? (fiber.alternate ? authoredValues.get(fiber.alternate) : undefined);
  const record = existing ?? new Map<string, AuthoredValue>();
  authoredValues.set(fiber, record);
  if (fiber.alternate) authoredValues.set(fiber.alternate, record);
  return record;
}

/**
 * React's override starts from the last rendered props, so two calls before
 * a render would lose the first. Each invocation gets one whole-props write.
 */
function editInvocation(
  renderer: ReactRendererInternals,
  fiber: Fiber,
  overrides: FiberProps | undefined,
  restoring: ReadonlySet<string> | undefined,
): void {
  const rendered = fiber.memoizedProps ?? {};
  const next = { ...rendered };
  const authored = authoredFor(fiber);
  let changed = false;
  for (const prop of restoring ?? []) {
    const original = authored.get(prop);
    if (!original) continue;
    authored.delete(prop);
    if (original.present) next[prop] = original.value;
    else delete next[prop];
    changed = true;
  }
  for (const [prop, value] of Object.entries(overrides ?? {})) {
    if (Object.is(rendered[prop], value)) continue;
    authored.set(prop, { present: Object.hasOwn(rendered, prop), value: rendered[prop] });
    next[prop] = value;
    changed = true;
  }
  if (changed) renderer.overrideProps?.(fiber, [], next);
}

function applyOverrides(restoring: ReadonlyMap<string, ReadonlySet<string>> = new Map()): void {
  if (overridesByCallsite.size === 0 && restoring.size === 0) return;
  const callsiteIds = new Set([...overridesByCallsite.keys(), ...restoring.keys()]);
  for (const root of trackedRoots()) {
    const renderer = propEditingRenderer(root);
    if (!renderer?.overrideProps) continue;
    const invocations = mountedInvocations([root]);
    for (const callsiteId of callsiteIds) {
      for (const fiber of invocations.get(callsiteId) ?? []) {
        editInvocation(renderer, fiber, overridesByCallsite.get(callsiteId), restoring.get(callsiteId));
      }
    }
  }
}

/** Overrides for registered callsites only; wrapped callsites keep their boundary. */
export function replaceTaggedOverrides(next: ReadonlyMap<string, FiberProps>): void {
  const registered = new Map([...next].filter(([callsiteId]) => callsites.has(callsiteId)));
  const restoring = new Map<string, Set<string>>();
  for (const [callsiteId, props] of overridesByCallsite) {
    const following = registered.get(callsiteId);
    const dropped = Object.keys(props).filter((prop) => !following || !Object.hasOwn(following, prop));
    if (dropped.length > 0) restoring.set(callsiteId, new Set(dropped));
  }
  overridesByCallsite = registered;
  observeCommits();
  applyOverrides(restoring);
}

// A parent render hands an invocation its authored props again, so overrides
// are reapplied after every commit while any are active. Unchanged values are
// skipped, which is what ends the cycle. Subscribed lazily: the hook may not
// exist yet when this module first evaluates.
let reapplyQueued = false;
let stopObserving: (() => void) | null = null;
function observeCommits(): void {
  if (stopObserving) return;
  const stop = onCommit(() => {
    treeGeneration += 1;
    if (overridesByCallsite.size === 0 || reapplyQueued) return;
    reapplyQueued = true;
    queueMicrotask(() => {
      reapplyQueued = false;
      applyOverrides();
    });
  });
  if (trackedRootsAvailable()) stopObserving = stop;
}

/** Test/runtime teardown hook. */
export function resetTaggedCallsites(): void {
  callsites.clear();
  overridesByCallsite = new Map();
  stopObserving?.();
  stopObserving = null;
}
