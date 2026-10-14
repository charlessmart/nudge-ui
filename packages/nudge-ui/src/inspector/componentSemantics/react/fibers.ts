// React's private fiber shape: not a public API, so every read tolerates a missing or differently shaped value.
/** Props exactly as the application passed them; values are read and checked individually. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
export type FiberProps = Readonly<Record<string, unknown>>;

export interface Fiber {
  type?: unknown;
  tag?: number;
  memoizedProps?: FiberProps | null;
  return?: Fiber | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  alternate?: Fiber | null;
  stateNode?: unknown;
}

/** React work tags for host output that has no string element type. */
const HOST_PORTAL_TAG = 4;
const HOST_TEXT_TAG = 6;
export const HOST_ROOT_TAG = 3;

type ReactOwnedNode = Element & { [key: `__react${string}`]: Fiber | undefined };

export function findFiber(element: Element): Fiber | null {
  for (const key of Object.keys(element)) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
      // SAFETY: React DOM stores the node's fiber under this generated key; every field is read defensively.
      return (element as ReactOwnedNode)[key as `__react${string}`] ?? null;
    }
  }
  return null;
}

export function isHostOutput(fiber: Fiber): boolean {
  return typeof fiber.type === "string" || fiber.tag === HOST_TEXT_TAG || fiber.tag === HOST_PORTAL_TAG;
}

/** Counts top-level host outputs below a fiber, stopping once there are two. */
export function hostOutputCount(fiber: Fiber): number {
  let count = 0;
  const visit = (parent: Fiber): void => {
    for (let child = parent.child ?? null; child && count < 2; child = child.sibling ?? null) {
      if (isHostOutput(child)) count += 1;
      else visit(child);
    }
  };
  visit(fiber);
  return count;
}
