import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";

interface ClientAsset {
  readonly body: Buffer;
  readonly etag: string;
}

interface ClientAssetDependencies {
  readonly resolveClientPath?: () => string;
  readonly readClientFile?: (path: string) => Promise<Buffer>;
}

const packageRequire = createRequire(import.meta.url);

/**
 * Creates the Astro handler for the shared, immutable inspector client.
 * Resolution and reads remain lazy so disabled and production integrations do
 * not depend on a development asset being present.
 */
export function createAstroClientAssetHandler(
  dependencies: ClientAssetDependencies = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const resolveClientPath = dependencies.resolveClientPath
    ?? (() => packageRequire.resolve("@nudge-ui/inspector/client"));
  const readClientFile = dependencies.readClientFile ?? readFile;
  let cachedAsset: Promise<ClientAsset> | undefined;

  return async (request, response) => {
    const asset = await loadClientAsset();
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("ETag", asset.etag);
    if (request.headers["if-none-match"] === asset.etag) {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(request.method === "HEAD" ? undefined : asset.body);
  };

  function loadClientAsset(): Promise<ClientAsset> {
    if (cachedAsset) return cachedAsset;
    const current = load();
    cachedAsset = current;
    void current.catch(() => {
      if (cachedAsset === current) cachedAsset = undefined;
    });
    return current;
  }

  async function load(): Promise<ClientAsset> {
    try {
      const body = await readClientFile(resolveClientPath());
      const digest = createHash("sha256").update(body).digest("base64url");
      return { body, etag: `"sha256-${digest}"` };
    } catch (cause) {
      throw new Error(
        "Nudge UI could not load its inspector client. "
          + "Build @nudge-ui/inspector (`pnpm --filter @nudge-ui/inspector build`) "
          + "in a source workspace, or reinstall @nudge-ui/inspector in an installed project.",
        { cause },
      );
    }
  }
}
