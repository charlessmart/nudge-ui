import { describe, expect, it, vi } from "vitest";
import { createChannelClient, serveChannel, type ChannelProtocol } from "./bridge.ts";

interface EchoRequest {
  readonly value: string;
}

interface EchoReply {
  readonly id: number;
  readonly echo?: string;
  readonly error?: string;
}

const protocol: ChannelProtocol<EchoRequest, EchoReply> = {
  name: "Echo",
  request: "test:echo-request",
  response: "test:echo-response",
  encodeRequest: (body) => JSON.stringify(body),
  decodeRequest: (detail) => {
    if (typeof detail !== "string") return null;
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as { id?: unknown; value?: unknown };
    return typeof candidate.id === "number" && typeof candidate.value === "string"
      ? { id: candidate.id, value: candidate.value }
      : null;
  },
  encodeReply: (reply) => JSON.stringify(reply),
  decodeReply: (detail) => {
    if (typeof detail !== "string") return null;
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as { id?: unknown; echo?: unknown; error?: unknown };
    return typeof candidate.id === "number"
      ? {
        id: candidate.id,
        ...(typeof candidate.echo === "string" ? { echo: candidate.echo } : {}),
        ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
      }
      : null;
  },
  encodeFailure: (id, error) => ({ id, error: error.message }),
};

describe("channel client and server", () => {
  it("round-trips a request and matches the reply by id", async () => {
    const target = new EventTarget();
    serveChannel(protocol, async ({ value }) => ({ echo: value.toUpperCase() }), { target });
    const client = createChannelClient(protocol, { target });

    const first = client.send({ value: "one" });
    const second = client.send({ value: "two" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 1, echo: "ONE" },
      { id: 2, echo: "TWO" },
    ]);
  });

  it("turns a thrown handler into a failure reply", async () => {
    const target = new EventTarget();
    serveChannel(protocol, () => {
      throw new Error("storage is full");
    }, { target });
    const client = createChannelClient(protocol, { target });

    await expect(client.send({ value: "x" })).resolves.toEqual({ id: 1, error: "storage is full" });
  });

  it("rejects when nothing answers, instead of waiting forever", async () => {
    vi.useFakeTimers();
    const client = createChannelClient(protocol, { target: new EventTarget(), timeoutMs: 100 });
    const pending = client.send({ value: "x" });
    const settled = expect(pending).rejects.toThrow("Echo did not respond.");
    await vi.advanceTimersByTimeAsync(100);
    await settled;
    vi.useRealTimers();
  });

  it("ignores a reply for another id", async () => {
    const target = new EventTarget();
    serveChannel(protocol, async ({ value }) => ({ echo: value }), { target });
    const client = createChannelClient(protocol, { target, timeoutMs: 50 });
    target.dispatchEvent(new CustomEvent(protocol.response, { detail: JSON.stringify({ id: 99, echo: "wrong" }) }));
    await expect(client.send({ value: "x" })).resolves.toEqual({ id: 1, echo: "x" });
  });

  it("rejects pending requests when the client is disposed", async () => {
    const client = createChannelClient(protocol, { target: new EventTarget() });
    const pending = client.send({ value: "x" });
    client.dispose();
    await expect(pending).rejects.toThrow("Echo was closed before it answered.");
  });
});
