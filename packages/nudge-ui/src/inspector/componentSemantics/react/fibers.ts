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

/** Only the naming fields of a component type; any of them may be missing or hold a non-string value. */
interface NamedComponentType {
  displayName?: string;
  name?: string;
  render?: NamedComponentType;
  type?: NamedComponentType;
}

function readName(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** forwardRef keeps its render function under `render` and memo its component under `type`. */
function componentTypeName(fiber: Fiber): { name: string; explicit: boolean } | null {
  const { type } = fiber;
  if (!type || (typeof type !== "function" && typeof type !== "object")) return null;
  // SAFETY: component types are functions or forwardRef/memo objects, and readName checks each field's type.
  const named = type as NamedComponentType;
  const explicit = readName(named.displayName) ?? readName(named.render?.displayName) ?? readName(named.type?.displayName);
  if (explicit) return { name: explicit, explicit: true };
  const inferred = readName(named.name) ?? readName(named.render?.name) ?? readName(named.type?.name);
  // Lowercase names are minified or anonymous, so they would not help anyone recognise the component.
  return inferred && /^[A-Z]/.test(inferred) ? { name: inferred, explicit: false } : null;
}

/**
 * Names the component whose root renders `element`: the outermost layer with an explicit `displayName`, as design
 * systems set (`Stack` over the `Box` it renders), or else the nearest capitalised function name.
 */
export function hostComponentName(element: Element): string | null {
  const host = findFiber(element);
  let nearest: string | null = null;
  let outermostExplicit: string | null = null;
  for (let fiber = host?.return ?? null; fiber && !isHostOutput(fiber) && fiber.tag !== HOST_ROOT_TAG; fiber = fiber.return ?? null) {
    const component = componentTypeName(fiber);
    if (!component) continue;
    nearest ??= component.name;
    if (component.explicit) outermostExplicit = component.name;
  }
  return outermostExplicit ?? nearest;
}
