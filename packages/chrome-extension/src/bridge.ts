/**
 * One request/response channel over the page's DOM events. Every capability the extension bridges (storage, screenshots,
 * fonts) is the same three things — an event pair, a way to encode each side, and a timeout — so they share one
 * implementation instead of three hand-rolled ones.
 */

export interface ChannelProtocol<Body, Reply extends { id: number }> {
  /** Used in timeout and failure messages. */
  readonly name: string;
  /** Dispatched on the page by the inspector. */
  readonly request: string;
  /** Dispatched on the page by the isolated-world bridge. */
  readonly response: string;
  readonly encodeRequest: (body: Body & { id: number }) => unknown;
  readonly decodeRequest: (detail: unknown) => (Body & { id: number }) | null;
  readonly encodeReply: (reply: Reply) => unknown;
  readonly decodeReply: (detail: unknown) => Reply | null;
  /** A reply the bridge sends when its handler throws. */
  readonly encodeFailure: (id: number, error: Error) => Reply;
}

export interface ChannelClient<Body, Reply extends { id: number }> {
  send(body: Body): Promise<Reply>;
  dispose(): void;
}

export interface ChannelOptions {
  /** Defaults to the page's `document`. */
  readonly target?: EventTarget;
  /** Defaults to 5 seconds; a bridge that never answers must not leave a caller waiting forever. */
  readonly timeoutMs?: number;
}

export const DEFAULT_CHANNEL_TIMEOUT_MS = 5_000;

/** The inspector's half: sends a request and settles when the bridge answers with the same id. */
export function createChannelClient<Body, Reply extends { id: number }>(
  protocol: ChannelProtocol<Body, Reply>,
  options: ChannelOptions = {},
): ChannelClient<Body, Reply> {
  const target = options.target ?? document;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
  let nextId = 0;
  const pending = new Map<number, {
    readonly resolve: (reply: Reply) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  }>();

  const onResponse = (event: Event): void => {
    const reply = protocol.decodeReply((event as CustomEvent<unknown>).detail);
    if (!reply) return;
    const entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    entry.resolve(reply);
  };
  target.addEventListener(protocol.response, onResponse);

  return {
    send(body) {
      return new Promise<Reply>((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${protocol.name} did not respond.`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        target.dispatchEvent(new CustomEvent(protocol.request, { detail: protocol.encodeRequest({ ...body, id }) }));
      });
    },
    dispose() {
      target.removeEventListener(protocol.response, onResponse);
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`${protocol.name} was closed before it answered.`));
      }
      pending.clear();
    },
  };
}

/** The bridge's half: answers each request, including a failure reply when the handler throws. */
export function serveChannel<Body, Reply extends { id: number }>(
  protocol: ChannelProtocol<Body, Reply>,
  handler: (body: Body) => Promise<Omit<Reply, "id">> | Omit<Reply, "id">,
  options: Pick<ChannelOptions, "target"> = {},
): () => void {
  const target = options.target ?? document;
  const onRequest = (event: Event): void => {
    const body = protocol.decodeRequest((event as CustomEvent<unknown>).detail);
    if (!body) return;
    const reply = (value: Omit<Reply, "id">): void => {
      target.dispatchEvent(new CustomEvent(protocol.response, {
        detail: protocol.encodeReply({ ...value, id: body.id } as Reply),
      }));
    };
    void Promise.resolve().then(() => handler(body)).then(reply, (error: unknown) => {
      reply(protocol.encodeFailure(body.id, error instanceof Error ? error : new Error(String(error))));
    });
  };
  target.addEventListener(protocol.request, onRequest);
  return () => target.removeEventListener(protocol.request, onRequest);
}

/** Fire-and-forget events, such as a stored preference, where nothing waits for an answer. */
export function sendNotification(target: EventTarget, event: string, detail: unknown): void {
  target.dispatchEvent(new CustomEvent(event, { detail }));
}
