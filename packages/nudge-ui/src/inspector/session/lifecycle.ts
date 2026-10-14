export type CleanupCallback = () => void;

/** Registration after disposal returns a no-op; disposal is idempotent and disposes adopted children before own callbacks. */
export interface SessionOwner {
  readonly id: string;
  readonly disposed: boolean;
  registerCleanup(callback: CleanupCallback): () => void;
  dispose(): void;
}

export interface SessionOwnerImplementation extends SessionOwner {
  adopt(child: SessionOwner): void;
}

type SessionKind = "workspace" | "inspector" | "document";

const NOOP = (): void => {};
let nextOwnerId = 0;

function nextId(kind: SessionKind): string {
  nextOwnerId += 1;
  return `${kind}-${nextOwnerId}`;
}

export function createSessionOwner(kind: SessionKind): SessionOwnerImplementation {
  let disposed = false;
  const children = new Set<SessionOwner>();
  const callbacks = new Set<{ callback: CleanupCallback }>();

  function registerCleanup(callback: CleanupCallback): () => void {
    if (disposed) return NOOP;

    const registration = { callback };
    callbacks.add(registration);
    return () => {
      callbacks.delete(registration);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    const errors: unknown[] = [];
    const run = (callback: () => void): void => {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    };

    for (const child of children) run(() => child.dispose());
    for (const { callback } of callbacks) run(callback);

    children.clear();
    callbacks.clear();

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `Failed to dispose ${kind} owner.`);
  }

  return {
    id: nextId(kind),
    get disposed() {
      return disposed;
    },
    registerCleanup,
    adopt(child): void {
      if (disposed) {
        child.dispose();
        return;
      }
      if (child.disposed) return;
      children.add(child);
      child.registerCleanup(() => children.delete(child));
    },
    dispose,
  };
}
