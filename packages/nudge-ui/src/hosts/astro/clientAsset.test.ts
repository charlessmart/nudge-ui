import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createAstroClientAssetHandler } from "./clientAsset.ts";

describe("createAstroClientAssetHandler", () => {
  it("resolves the client only when requested and reports how to recover", async () => {
    const resolveClientPath = vi.fn(() => {
      throw new Error("missing client");
    });
    const handler = createAstroClientAssetHandler({ resolveClientPath });

    expect(resolveClientPath).not.toHaveBeenCalled();
    const response = await request(handler);

    expect(response.status).toBe(503);
    expect(response.body).toContain("Build nudge-ui/inspector");
    expect(response.body).toContain("reinstall nudge-ui/inspector");
  });

  it("retries a client read after the missing asset is rebuilt", async () => {
    let attempts = 0;
    const handler = createAstroClientAssetHandler({
      resolveClientPath: () => "/workspace/inspector/dist/client.mjs",
      readClientFile: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("client was not built");
        return Buffer.from("export const client = true;");
      },
    });

    const missing = await request(handler);
    const rebuilt = await request(handler);

    expect(missing.status).toBe(503);
    expect(rebuilt).toMatchObject({
      status: 200,
      body: "export const client = true;",
    });
    expect(attempts).toBe(2);
  });

  it("revalidates the cached client with an ETag", async () => {
    const readClientFile = vi.fn(async () => Buffer.from("export {};"));
    const handler = createAstroClientAssetHandler({
      resolveClientPath: () => "/workspace/inspector/dist/client.mjs",
      readClientFile,
    });

    const initial = await request(handler);
    if (!initial.etag) throw new Error("Client response did not include an ETag.");
    const revalidated = await request(handler, { "If-None-Match": initial.etag });

    expect(initial.status).toBe(200);
    expect(revalidated).toMatchObject({ status: 304, body: "" });
    expect(readClientFile).toHaveBeenCalledTimes(1);
  });
});

async function request(
  handler: ReturnType<typeof createAstroClientAssetHandler>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; etag: string | null }> {
  const server = createServer((incoming, response) => {
    void handler(incoming, response).catch((error: unknown) => {
      response.statusCode = 503;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start.");
  const response = await fetch(`http://127.0.0.1:${address.port}/client.mjs`, { headers });
  const result = {
    status: response.status,
    body: await response.text(),
    etag: response.headers.get("etag"),
  };
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return result;
}
