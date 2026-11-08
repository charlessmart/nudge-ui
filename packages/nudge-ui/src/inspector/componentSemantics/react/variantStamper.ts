import type { ComponentInvocationMeta } from "../types.ts";
import type { ComponentContract } from "../types.ts";
import {
  VARIANT_ATTRIBUTE,
  variantAttributeValue,
  variantPropNames,
  variantTokensForProps,
} from "../variantMarkers.ts";
import { isHostOutput, type Fiber, type FiberProps } from "./fibers.ts";
import { onCommit, trackedRoots, trackedRootsAvailable, type FiberRoot } from "./devtoolsHook.ts";

/** What a stamping pass needs to know about a fiber that renders an instrumented invocation. */
export interface StampedInvocation {
  meta: ComponentInvocationMeta;
  props: FiberProps;
}

export type InvocationResolver = (fiber: Fiber) => StampedInvocation | null;

const HOST_COMPONENT_TAG = 5;

let contracts: readonly ComponentContract[] = [];

let stamped = new Map<Element, string>();
let stopObserving: (() => void) | null = null;
let queued = false;
let resolver: InvocationResolver | null = null;
let contractCache: { source: readonly ComponentContract[]; byId: Map<string, ComponentContract>; byName: Map<string, ComponentContract> } | null = null;

function variantContracts() {
  const source = contracts;
  if (contractCache?.source === source) return contractCache;
  const byId = new Map<string, ComponentContract>();
  const byName = new Map<string, ComponentContract>();
  for (const contract of source) {
    if (variantPropNames(contract).length === 0) continue;
    byId.set(contract.componentId, contract);
    byName.set(contract.name, byName.has(contract.name) ? byName.get(contract.name)! : contract);
  }
  contractCache = { source, byId, byName };
  return contractCache;
}

/** Top-level host nodes below a fiber: the DOM the invocation owns outright. */
function topLevelHosts(fiber: Fiber, into: Element[]): void {
  for (let child = fiber.child ?? null; child; child = child.sibling ?? null) {
    if (isHostOutput(child)) {
      if (child.tag === HOST_COMPONENT_TAG && child.stateNode instanceof Element) into.push(child.stateNode);
    } else {
      topLevelHosts(child, into);
    }
  }
}

/** One walk of a mounted tree: every instrumented invocation's root nodes receive their variant tokens. */
function collect(root: FiberRoot, resolve: InvocationResolver, into: Map<Element, Set<string>>): void {
  const { byId, byName } = variantContracts();
  const top = root.current;
  if (!top) return;
  const stack: Fiber[] = [top];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    if (!isHostOutput(fiber)) {
      const invocation = resolve(fiber);
      const contract = invocation
        ? byId.get(invocation.meta.componentId) ?? byName.get(invocation.meta.componentName)
        : undefined;
      if (invocation && contract) {
        const tokens = variantTokensForProps(contract, invocation.props);
        if (tokens.length > 0) {
          const hosts: Element[] = [];
          topLevelHosts(fiber, hosts);
          for (const host of hosts) {
            const set = into.get(host) ?? new Set<string>();
            for (const token of tokens) set.add(token);
            into.set(host, set);
          }
        }
      }
    }
    for (let child = fiber.child ?? null; child; child = child.sibling ?? null) stack.push(child);
  }
}

/** Synchronous pass; exported for tests and for runtimes that need markers before the next commit. */
export function stampVariantMarkers(roots: Iterable<FiberRoot>, resolve: InvocationResolver): void {
  const next = new Map<Element, Set<string>>();
  if (variantContracts().byId.size > 0) for (const root of roots) collect(root, resolve, next);
  const applied = new Map<Element, string>();
  for (const [element, tokens] of next) {
    const value = variantAttributeValue(tokens);
    applied.set(element, value);
    if (element.getAttribute(VARIANT_ATTRIBUTE) !== value) element.setAttribute(VARIANT_ATTRIBUTE, value);
  }
  for (const [element, value] of stamped) {
    if (!applied.has(element) && element.getAttribute(VARIANT_ATTRIBUTE) === value) element.removeAttribute(VARIANT_ATTRIBUTE);
  }
  stamped = applied;
}

function schedule(): void {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    if (resolver) stampVariantMarkers(trackedRoots(), resolver);
  });
}

/** The inspector client publishes contracts through the host runtime registry; markers follow them. */
export function setVariantContracts(next: readonly ComponentContract[]): void {
  contracts = next;
  schedule();
}

/** Keeps markers current after every commit; idle unless a contract has select or boolean props. */
export function startVariantMarkers(resolve: InvocationResolver): void {
  resolver = resolve;
  if (stopObserving) return;
  const stop = onCommit(schedule);
  if (trackedRootsAvailable()) stopObserving = stop;
  schedule();
}

export function resetVariantMarkers(): void {
  stopObserving?.();
  stopObserving = null;
  resolver = null;
  contractCache = null;
  for (const [element, value] of stamped) {
    if (element.getAttribute(VARIANT_ATTRIBUTE) === value) element.removeAttribute(VARIANT_ATTRIBUTE);
  }
  stamped = new Map();
}
