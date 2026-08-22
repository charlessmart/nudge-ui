import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, type DesignToolManifest } from "./manifest.ts";

/**
 * Loopback-only manifest/reload sidecar (ADR-0010).
 *
 * One server per dev-server process, guarded against double-spawn because
 * Next re-evaluates `next.config` more than once. Same-origin access without
 * CORS comes from a `beforeFiles` rewrite proxying `/__design_tool__/*` to the
 * sidecar port — both are wrapper-owned config, so the user touchpoint stays
 * at one line.
 *
 * Routes:
 * - GET /__design_tool__/manifest — the frozen runtime snapshot.
 * - GET /__design_tool__/reload  — SSE revision notifications after settled
 *   file changes. Stage 3 emits revisions only when told to; Stage 4 wires
 *   the token watcher to it.
 */

const STATE_DIR_SEGMENT = ".next";

export interface SidecarHandle {
  port: number;
  close: () => Promise<void>;
  /** Bumps the reload revision and notifies open SSE streams. */
  publishRevision: (revision: number) => void;
}

interface GlobalSidecarState {
  handle?: SidecarHandle;
  starting?: Promise<SidecarHandle>;
}

const GLOBAL_KEY = Symbol.for("@design-tool/nextjs/sidecar");

function globalState(): GlobalSidecarState {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: GlobalSidecarState };
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = {};
  return holder[GLOBAL_KEY];
}

function stateDirFor(root: string): string {
  return join(root, STATE_DIR_SEGMENT);
}

function portFilePath(root: string): string {
  return join(stateDirFor(root), "design-tool-sidecar.json");
}

/** Removes a stale port file left by a crashed previous run. */
export function clearStaleSidecarState(root: string): void {
  try {
    const raw = JSON.parse(readFileSync(portFilePath(root), "utf8")) as { pid?: number };
    if (typeof raw.pid === "number" && raw.pid !== process.pid) {
      // A previous process's record: safe to drop. The loopback socket it
      // named cannot be trusted for reuse and is never dialled here.
      rmSync(portFilePath(root), { force: true });
    }
  } catch {
    // Absent or unreadable state is fine; a fresh record gets written below.
  }
}

/**
 * Starts (or returns) the sidecar for this dev-server process.
 *
 * `root` is the project root; the manifest names itself from it. The server
 * binds 127.0.0.1 exclusively.
 */
export async function ensureSidecar(
  root: string,
  options: { manifest?: DesignToolManifest } = {},
): Promise<SidecarHandle> {
  const state = globalState();
  if (state.handle) return state.handle;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    let generation = 0;
    const streams = new Set<ServerResponse>();

    const manifest = options.manifest ?? buildManifest({ root });

    const server: Server = createServer((req, res) => {
      respond(req, res, manifest, () => generation, streams);
    });

    const port = await new Promise<number>((resolvePort, rejectPort) => {
      server.once("error", rejectPort);
      // Port 0 asks the kernel for a free loopback port, so concurrent
      // projects on one machine never collide.
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") resolvePort(address.port);
        else rejectPort(new Error("design-tool sidecar failed to report its port"));
      });
    });

    try {
      mkdirSync(stateDirFor(root), { recursive: true });
      writeFileSync(portFilePath(root), `${JSON.stringify({ pid: process.pid, port })}\n`);
    } catch {
      // The port file is diagnostics-only; the rewrite carries the real
      // transport, so an unwritable .next must not break instrumentation.
    }

    const handle: SidecarHandle = {
      port,
      publishRevision(revision: number): void {
        generation = revision;
        for (const stream of streams) stream.write(`data: ${JSON.stringify({ revision })}\n\n`);
      },
      close(): Promise<void> {
        // Idempotent: the singleton handle can be reached from several test
        // files in one worker, and a dev server shutdown may race an explicit
        // close. Closing twice must not throw.
        if (!server.listening) {
          state.handle = undefined;
          return Promise.resolve();
        }
        for (const stream of streams) stream.end();
        streams.clear();
        rmSync(portFilePath(root), { force: true });
        state.handle = undefined;
        return new Promise((resolveClose, rejectClose) => {
          server.close((error) => (error ? rejectClose(error) : resolveClose()));
        });
      },
    };

    state.handle = handle;
    state.starting = undefined;
    return handle;
  })();

  return state.starting;
}

function respond(
  req: IncomingMessage,
  res: ServerResponse,
  manifest: DesignToolManifest,
  currentGeneration: () => number,
  streams: Set<ServerResponse>,
): void {
  const url = (req.url ?? "").split("?")[0];

  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }

  if (url === "/__design_tool__/manifest") {
    const body = `${JSON.stringify(manifest)}\n`;
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }

  if (url === "/__design_tool__/reload") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": design-tool reload stream\n\n");
    streams.add(res);
    res.on("close", () => streams.delete(res));
    // Announce the current generation so late subscribers can reconcile.
    res.write(`data: ${JSON.stringify({ revision: currentGeneration() })}\n\n`);
    return;
  }

  res.writeHead(404).end();
}
