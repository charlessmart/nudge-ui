import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  buildManifest,
  type NudgeUiManifest,
  type NudgeUiTokenSnapshot,
} from "./manifest.ts";
import { extractComponentContracts } from "@nudge-ui/vite-react/component-contracts";
import { createStandaloneFileWatcher } from "@nudge-ui/standalone/watcher";
import { createStandaloneTokenSnapshot } from "@nudge-ui/standalone/token-manifest";

/**
 * Loopback-only manifest/reload sidecar (ADR-0010).
 *
 * One server per dev-server process, guarded against double-spawn because
 * Next re-evaluates `next.config` more than once. Same-origin access without
 * CORS comes from a `beforeFiles` rewrite proxying `/__nudge_ui__/*` to the
 * sidecar port — both are wrapper-owned config, so the user touchpoint stays
 * at one line.
 *
 * Routes:
 * - GET /__nudge_ui__/client.mjs — the shared self-contained inspector client.
 * - GET /__nudge_ui__/manifest — the frozen runtime snapshot, including
 *   the Stage 4 token lifecycle when `tokens` is enabled: scanned project CSS
 *   feeds a deterministic generation, and each settled watcher batch bumps
 *   the generation and emits exactly one reload notification.
 * - GET /__nudge_ui__/reload  — SSE revision notifications after settled
 *   file changes.
 */

const STATE_DIR_SEGMENT = ".next";
const packageRequire = createRequire(import.meta.url);
let inspectorClientPath: string | undefined;

export interface SidecarHandle {
  port: number;
  close: () => Promise<void>;
  /** Bumps the reload revision and notifies open SSE streams. */
  publishRevision: (revision: number) => void;
}

interface GlobalSidecarEntry {
  /**
   * Cached start promise. Resolves to the live handle once started; cleared
   * on close and on failure (so a failed start can be retried).
   */
  starting?: Promise<SidecarHandle>;
}

const GLOBAL_KEY = Symbol.for("@nudge-ui/nextjs/sidecar");

/**
 * One sidecar per process per configuration. The key keeps a token-enabled
 * server from being conflated with a bare manifest-only server created
 * elsewhere in the same process (tests, multiple projects).
 */
function globalState(key: string): GlobalSidecarEntry {
  // SAFETY: The GLOBAL_KEY symbol names the one global slot this module owns and writes itself.
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, GlobalSidecarEntry> };
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = new Map();
  let entry = holder[GLOBAL_KEY].get(key);
  if (!entry) {
    entry = {};
    holder[GLOBAL_KEY].set(key, entry);
  }
  return entry;
}

function stateDirFor(root: string): string {
  return join(root, STATE_DIR_SEGMENT);
}

function portFilePath(root: string): string {
  return join(stateDirFor(root), "nudge-ui-sidecar.json");
}

const CONTRACT_SOURCE_EXT = /\.(tsx|jsx)$/;
const SCAN_EXCLUDED_SEGMENTS = new Set([".git", ".next", "build", "dist", "node_modules"]);
/** Upper bound on examined project source files; truncation is announced. */
const SCAN_MAX_SOURCES = 5000;

/**
 * Extracts component contracts directly from project sources.
 *
 * Compile-time loader postings alone leave a restart gap: Turbopack's
 * persistent cache serves previously compiled modules without re-running
 * loaders, so a fresh sidecar would publish an empty contract catalog until
 * every file happens to recompile. Reading the same authored sources the
 * loader reads keeps the manifest coherent across dev-server restarts.
 *
 * `canonicalRoot` must be the realpath'd project root so aggregation keys
 * match both loader postings and watcher events regardless of how the host
 * spelled the working directory.
 */
async function scanProjectContracts(
  canonicalRoot: string,
  apply: (file: string, contracts: unknown[]) => void,
): Promise<{ truncated: boolean; files: Set<string> }> {
  const queue: string[] = [canonicalRoot];
  const files = new Set<string>();
  let examined = 0;
  let truncated = false;
  while (queue.length > 0 && !truncated) {
    const directory = queue.shift()!;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    // Deterministic order keeps any truncation boundary stable across runs.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SCAN_EXCLUDED_SEGMENTS.has(entry.name)) queue.push(absolutePath);
        continue;
      }
      if (!CONTRACT_SOURCE_EXT.test(entry.name)) continue;
      if (++examined > SCAN_MAX_SOURCES) {
        truncated = true;
        break;
      }
      const relativeFile = relative(canonicalRoot, absolutePath).split("\\").join("/");
      files.add(relativeFile);
      try {
        const source = readFileSync(absolutePath, "utf8");
        apply(relativeFile, extractComponentContracts(source, relativeFile));
      } catch {
        /* unreadable sources contribute no knowledge */
      }
    }
  }
  if (truncated) {
    console.warn(
      `[nudge-ui] component contract scan stopped at ${SCAN_MAX_SOURCES} sources; `
        + "contracts beyond that bound are missing until their files compile.",
    );
  }
  return { truncated, files };
}

/**
 * Reads one source file only while its size is stable across the read.
 * Editors that truncate-then-write can expose half a file at read time; a
 * syntactically valid prefix would otherwise replace good contracts with
 * wrong ones until the next settled batch.
 */
function readStableSource(absolutePath: string): { source: string } | null {
  try {
    const sizeBefore = statSync(absolutePath).size;
    const source = readFileSync(absolutePath, "utf8");
    if (statSync(absolutePath).size !== sizeBefore || Buffer.byteLength(source) !== sizeBefore) {
      return null;
    }
    return { source };
  } catch {
    return null;
  }
}

/** Removes a stale port file left by a crashed previous run. */
export function clearStaleSidecarState(root: string): void {
  try {
    // SAFETY: The JSON.parse result is validated by the typeof guard below before use.
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

export interface SidecarOptions {
  manifest?: NudgeUiManifest;
  /**
   * Enables the Stage 4 token lifecycle: an initial project CSS scan feeds
   * the manifest's token fields, and a settled-batch watcher republishes on
   * add/change/remove transitions. Diagnostics never disable inspection.
   */
  tokens?: boolean;
}

/**
 * Starts (or returns) the sidecar for this dev-server process.
 *
 * `root` is the project root; the manifest names itself from it. The server
 * binds 127.0.0.1 exclusively.
 */
export async function ensureSidecar(
  root: string,
  options: SidecarOptions = {},
): Promise<SidecarHandle> {
  // Watchers and removal events report REAL paths; on macOS the tmp/root
  // prefix may differ (e.g. /tmp -> /private/tmp), so canonicalize once and
  // derive every filesystem-relative computation from the canonical root.
  const fsRoot = await realpath(root).catch(() => root);
  const state = globalState(`${options.tokens ? "tokens" : "manifest"}:${fsRoot}`);
  // The settled promise doubles as the handle cache: awaiting it replays the
  // same handle for every caller until close/failure clears the slot.
  if (state.starting) return state.starting;

  const starting = (async () => {
    let generation = 0;
    const streams = new Set<ServerResponse>();

    // Token knowledge lives in a mutable holder so settled batches can swap
    // the snapshot without rebuilding the rest of the manifest.
    // Component contracts aggregate across loader postings, keyed by file so
    // recompiles replace rather than duplicate (Stage 5). A debounced flush
    // publishes one revision per settled burst of compilations.
    const contractsByFile = new Map<string, unknown[]>();
    let contractsTimer: NodeJS.Timeout | null = null;
    const flushContracts = (): void => {
      contractsTimer = null;
      const flat: unknown[] = [];
      for (const list of contractsByFile.values()) flat.push(...list);
      // SAFETY: contracts come from the shared extractor or the loader's
      // serialized output of that same extractor contract.
      manifest.runtime.componentContracts = flat as NudgeUiManifest["runtime"]["componentContracts"];
      generation += 1;
      for (const stream of streams) {
        stream.write(`data: ${JSON.stringify({ revision: generation })}\n\n`);
      }
    };

    const manifest: NudgeUiManifest = options.manifest ?? buildManifest({ root });

    const applySnapshot = (snapshot: NudgeUiTokenSnapshot): void => {
      manifest.runtime.tokenCatalog = snapshot.tokenCatalog;
      manifest.runtime.tokens = snapshot.tokens;
      manifest.runtime.tokenDiagnostics = snapshot.tokenDiagnostics;
      // The shared scanner labels its digest static-html:<digest>; this host
      // publishes the same deterministic digest under its own namespace.
      manifest.runtime.tokenGeneration = snapshot.tokenGeneration.replace(
        /^static-html:/,
        "nextjs-token:",
      );
    };

    const receiveContracts = (file: string, contracts: unknown[]): void => {
      contractsByFile.set(file, contracts);
      if (!contractsTimer) contractsTimer = setTimeout(flushContracts, 120);
    };

    const server: Server = createServer((req, res) => {
      respond(req, res, () => manifest, () => generation, streams, receiveContracts);
    });

    const port = await new Promise<number>((resolvePort, rejectPort) => {
      server.once("error", rejectPort);
      // Port 0 asks the kernel for a free loopback port, so concurrent
      // projects on one machine never collide.
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") resolvePort(address.port);
        else rejectPort(new Error("nudge-ui sidecar failed to report its port"));
      });
    });

    try {
      mkdirSync(stateDirFor(root), { recursive: true });
      writeFileSync(portFilePath(root), `${JSON.stringify({ pid: process.pid, port })}\n`);
    } catch {
      // The port file is diagnostics-only; the rewrite carries the real
      // transport, so an unwritable .next must not break instrumentation.
    }

    const watchers: Array<{ close: () => Promise<void> }> = [];
    // The startup source scan runs regardless of the token lifecycle so a
    // restarted sidecar republishes contracts even when Turbopack's
    // persistent cache skips every loader re-run.
    try {
      await scanProjectContracts(fsRoot, (file, list) => {
        contractsByFile.set(file, list);
      });
      if (contractsByFile.size > 0) flushContracts();
    } catch {
      /* an unreadable tree keeps whatever knowledge postings provided */
    }
    if (options.tokens) {
      // Initial scan before the first manifest response so early clients see
      // tokens without waiting for a watcher tick. Failures degrade to the
      // empty snapshot already present in the manifest.
      try {
        applySnapshot(await createStandaloneTokenSnapshot({ rootDirectory: root }));
      } catch {
        /* keep empty snapshot */
      }
      generation += 1;

      const watcher = createStandaloneFileWatcher({
        rootDirectory: fsRoot,
        debounceMs: 60,
        onSettled: async (changes) => {
          let needsContractRescan = false;
          // Changed or deleted component sources update their aggregated
          // contracts directly: deletions must prune (or stale controls
          // survive forever), and edits re-extract from the authored bytes
          // even if a compiler cache never re-runs the loader. A read that
          // lands mid-write is skipped — the next settled batch retries.
          for (const change of changes) {
            const normalized = change.absolutePath.split("\\").join("/");
            // fs.watch can report a directory or omit a filename. In that
            // case the exact source is unknown, so a bounded project scan is
            // the only way to keep the contract catalog coherent.
            if (!CONTRACT_SOURCE_EXT.test(normalized)) {
              needsContractRescan = true;
              continue;
            }
            const key = relative(fsRoot, normalized);
            if (change.kind === "remove") {
              contractsByFile.delete(key);
              continue;
            }
            const stable = readStableSource(change.absolutePath);
            if (!stable) {
              needsContractRescan = true;
              continue;
            }
            try {
              contractsByFile.set(key, extractComponentContracts(stable.source, key));
            } catch {
              /* syntactically invalid sources keep their previous knowledge */
            }
          }

          if (needsContractRescan) {
            const scannedContracts = new Map<string, unknown[]>();
            const scan = await scanProjectContracts(fsRoot, (file, list) => {
              scannedContracts.set(file, list);
            });
            if (!scan.truncated) {
              for (const file of contractsByFile.keys()) {
                if (!scan.files.has(file)) contractsByFile.delete(file);
              }
            }
            for (const [file, list] of scannedContracts) {
              contractsByFile.set(file, list);
            }
          }

          // One settled batch = exactly one token scan + one contract flush
          // + one generation bump + exactly one reload notification, however
          // many fs events fed it.
          try {
            applySnapshot(await createStandaloneTokenSnapshot({ rootDirectory: root }));
          } catch {
            /* unreadable trees keep the previous snapshot */
          }
          flushContracts();
        },
      });
      await watcher.start();
      watchers.push(watcher);
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
          state.starting = undefined;
          return Promise.resolve();
        }
        for (const stream of streams) stream.end();
        streams.clear();
        void Promise.all(watchers.map((watcher) => watcher.close().catch(() => {})));
        rmSync(portFilePath(root), { force: true });
        state.starting = undefined;
        return new Promise((resolveClose, rejectClose) => {
          server.close((error) => (error ? rejectClose(error) : resolveClose()));
        });
      },
    };

    return handle;
  })();

  // A failed start must not wedge the singleton forever: the Symbol.for key
  // survives HMR re-evaluation, so a cached rejected promise would be
  // replayed to every later caller. Observe the rejection and clear the slot
  // (identity-checked so a concurrent successful start is never discarded).
  starting.catch(() => {
    if (state.starting === starting) state.starting = undefined;
  });
  state.starting = starting;
  return starting;
}

function respond(
  req: IncomingMessage,
  res: ServerResponse,
  currentManifest: () => NudgeUiManifest,
  currentGeneration: () => number,
  streams: Set<ServerResponse>,
  receiveContracts: (file: string, contracts: unknown[]) => void,
): void {
  const url = (req.url ?? "").split("?")[0];

  // Loader postings aggregate component contracts (Stage 5). Loopback-only by
  // virtue of the bind address; payload size is capped defensively.
  if (url === "/__nudge_ui__/contracts" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        // SAFETY: The JSON.parse result is validated by the typeof/Array.isArray guards below before use.
        const parsed = JSON.parse(body) as { file?: string; contracts?: unknown[] };
        if (typeof parsed.file !== "string" || !Array.isArray(parsed.contracts)) {
          res.writeHead(400).end();
          return;
        }
        receiveContracts(parsed.file, parsed.contracts);
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }

  if (url === "/__nudge_ui__/manifest") {
    // The served snapshot carries its revision so clients can reconcile
    // against SSE notifications instead of guessing.
    const body = `${JSON.stringify({ ...currentManifest(), revision: currentGeneration() })}\n`;
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }

  if (url === "/__nudge_ui__/client.mjs") {
    try {
      inspectorClientPath ??= packageRequire.resolve("@nudge-ui/inspector/client");
      const body = readFileSync(inspectorClientPath);
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(503).end("Nudge UI client has not been built.");
    }
    return;
  }

  if (url === "/__nudge_ui__/reload") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": nudge-ui reload stream\n\n");
    streams.add(res);
    res.on("close", () => streams.delete(res));
    // Announce the current generation so late subscribers can reconcile.
    res.write(`data: ${JSON.stringify({ revision: currentGeneration() })}\n\n`);
    return;
  }

  res.writeHead(404).end();
}
