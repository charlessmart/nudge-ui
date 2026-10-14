import { handleHtmlArtifactRequest } from "../../project/artifacts.ts";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  buildManifest,
  type NudgeUiManifest,
  type NudgeUiTokenSnapshot,
} from "./manifest.ts";
import { extractComponentContracts } from "../../compiler/componentContracts.ts";
import {
  createProjectFileWatcher,
  type ProjectFileChange,
} from "../../project/files.ts";
import { createProjectTokenSnapshot } from "../../project/tokens.ts";
import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_RELOAD_PATH,
  NUDGE_UI_ROUTE_PREFIX,
  createNudgeUiEditorDocument,
  isNudgeUiEditorDocumentRequest,
} from "../../transport/index.ts";
import { startOptionalProjectBridge } from "../projectBridge.ts";
import { automationManifestFields } from "../environment.ts";

const STATE_DIR_SEGMENT = ".next";
const packageRequire = createRequire(import.meta.url);
let inspectorClientPath: string | undefined;

export interface SidecarHandle {
  port: number;
  close: () => Promise<void>;
  publishRevision: (revision: number) => void;
}

interface GlobalSidecarEntry {
  starting?: Promise<SidecarHandle>;
}

const GLOBAL_KEY = Symbol.for("nudge-ui/next/sidecar");

/** One sidecar per process per configuration: the key keeps token-enabled and manifest-only servers distinct. */
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
const SCAN_MAX_SOURCES = 5000;

function hasWorkspaceManifest(directory: string): boolean {
  if (existsSync(join(directory, "pnpm-workspace.yaml"))) return true;
  try {
    // SAFETY: The parsed JSON shape is validated by the Array.isArray guards below before use.
    const packageJson = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
      workspaces?: unknown;
    };
    if (Array.isArray(packageJson.workspaces)) return true;
    if (typeof packageJson.workspaces !== "object" || packageJson.workspaces === null) return false;
    // SAFETY: The packages field is validated by Array.isArray before use.
    const packages = (packageJson.workspaces as { packages?: unknown }).packages;
    return Array.isArray(packages);
  } catch {
    return false;
  }
}

const MAX_WORKSPACE_SEARCH_DEPTH = 5;

/** Bounded upward walk; never promotes the filesystem root, so a stray manifest at `/` cannot become the scan root. */
function nearestWorkspaceRoot(root: string): string {
  let directory = root;
  for (let depth = 0; depth <= MAX_WORKSPACE_SEARCH_DEPTH; depth += 1) {
    if (hasWorkspaceManifest(directory)) {
      if (dirname(directory) === directory) return root;
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) return root;
    directory = parent;
  }
  return root;
}

async function tokenScanRoots(root: string, sourceRoots: readonly string[] = []): Promise<string[]> {
  const workspaceRoot = nearestWorkspaceRoot(root);
  const configuredRoots = sourceRoots.map((sourceRoot) => resolve(root, sourceRoot));
  const canonicalRoots = await Promise.all(
    [root, workspaceRoot, ...configuredRoots].map((scanRoot) =>
      realpath(scanRoot).catch(() => scanRoot)),
  );
  return [...new Set(canonicalRoots)];
}

function isWithinRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`)
      && pathFromRoot !== ".."
      && !isAbsolute(pathFromRoot));
}

/**
 * Reads authored sources directly because Turbopack's persistent cache can skip
 * loader re-runs; `canonicalRoot` must be realpath'd so keys match loader postings.
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

/** Null unless the size is stable across the read: truncate-then-write editors can expose a syntactically valid prefix. */
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

export function clearStaleSidecarState(root: string): void {
  try {
    // SAFETY: The JSON.parse result is validated by the typeof guard below before use.
    const raw = JSON.parse(readFileSync(portFilePath(root), "utf8")) as { pid?: number };
    if (typeof raw.pid === "number" && raw.pid !== process.pid) {
      // Previous process's record: the socket it named is never dialled, so dropping it is safe.
      rmSync(portFilePath(root), { force: true });
    }
  } catch {
    // Absent or unreadable state is fine; a fresh record gets written below.
  }
}

export interface SidecarOptions {
  manifest?: NudgeUiManifest;
  /** Authored workspace roots included in the token inventory and watcher. */
  sourceRoots?: readonly string[];
  tokens?: boolean;
  /** Trusted browser origin established by the Next development process. */
  projectBridgeOrigin?: string;
  /** Canonical loopback aliases for the known development port. */
  projectBridgeAllowedOrigins?: readonly string[];
}

export async function ensureSidecar(
  root: string,
  options: SidecarOptions = {},
): Promise<SidecarHandle> {
  // Watchers report REAL paths; on macOS the textual form can differ from root
  // (/tmp -> /private/tmp), so canonicalize once and derive everything from fsRoot.
  const fsRoot = await realpath(root).catch(() => root);
  const scanRoots = await tokenScanRoots(fsRoot, options.sourceRoots);
  const state = globalState(
    `${options.tokens ? "tokens" : "manifest"}:${options.projectBridgeOrigin ?? "plain"}:${fsRoot}:${scanRoots.join("|")}`,
  );
  // The settled promise doubles as the handle cache: awaiting it replays the
  // same handle for every caller until close/failure clears the slot.
  if (state.starting) return state.starting;

  const starting = (async () => {
    let generation = 0;
    const streams = new Set<ServerResponse>();

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

    let manifest: NudgeUiManifest = options.manifest ?? buildManifest({ root });
    let projectBridge: Awaited<ReturnType<typeof startOptionalProjectBridge>> = null;
    let projectBridgeStart: Promise<void> | null = null;

    const ensureProjectBridge = (): Promise<void> => {
      if (!options.projectBridgeOrigin || projectBridge || projectBridgeStart) {
        return projectBridgeStart ?? Promise.resolve();
      }
      projectBridgeStart = startOptionalProjectBridge({
        appRoot: fsRoot,
        projectId: manifest.runtime.projectId,
        origin: options.projectBridgeOrigin,
        ...(options.projectBridgeAllowedOrigins
          ? { allowedOrigins: options.projectBridgeAllowedOrigins }
          : {}),
        info: (message) => console.info(message),
        warn: (message) => console.warn(message),
      }).then((bridge) => {
        projectBridge = bridge;
        if (bridge) manifest = { ...manifest, agentBridge: bridge.browser };
      });
      return projectBridgeStart;
    };
    const closeProjectBridge = async (): Promise<void> => {
      await projectBridgeStart;
      const bridge = projectBridge;
      projectBridge = null;
      projectBridgeStart = null;
      await bridge?.close();
    };
    const additionalTokenRoots = scanRoots.filter((scanRoot) => scanRoot !== fsRoot);
    const tokenSnapshotOptions = {
      rootDirectory: fsRoot,
      generationLabel: "nextjs-token",
      ...(additionalTokenRoots.length > 0 ? { additionalRootDirectories: additionalTokenRoots } : {}),
    };

    const applySnapshot = (snapshot: NudgeUiTokenSnapshot): void => {
      manifest.runtime.tokenCatalog = snapshot.tokenCatalog;
      manifest.runtime.tokens = snapshot.tokens;
      manifest.runtime.tokenDiagnostics = snapshot.tokenDiagnostics;
      manifest.runtime.tokenGeneration = snapshot.tokenGeneration;
    };

    const receiveContracts = (file: string, contracts: unknown[]): void => {
      contractsByFile.set(file, contracts);
      if (!contractsTimer) contractsTimer = setTimeout(flushContracts, 120);
    };

    const server: Server = createServer((req, res) => {
      void handleHtmlArtifactRequest(req, res, fsRoot).then((handled) => {
        if (!handled) respond(req, res, () => manifest, () => generation, streams, receiveContracts);
      });
    });

    const port = await new Promise<number>((resolvePort, rejectPort) => {
      server.once("error", rejectPort);
      // Port 0 lets concurrent projects on one machine pick distinct free loopback ports.
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
      // The port file is diagnostics-only; an unwritable .next must not break instrumentation.
    }
    await ensureProjectBridge();

    const watchers: Array<{ close: () => Promise<void> }> = [];
    // Runs even without the token lifecycle so a restarted sidecar republishes contracts.
    try {
      await scanProjectContracts(fsRoot, (file, list) => {
        contractsByFile.set(file, list);
      });
      if (contractsByFile.size > 0) flushContracts();
    } catch {
      /* an unreadable tree keeps whatever knowledge postings provided */
    }
    if (options.tokens) {
      // Scan before the first manifest response so early clients see tokens without waiting for a watcher tick.
      try {
        applySnapshot(await createProjectTokenSnapshot(tokenSnapshotOptions));
      } catch {
        /* keep empty snapshot */
      }
      generation += 1;

      const settleTokens = async (): Promise<void> => {
        try {
          applySnapshot(await createProjectTokenSnapshot(tokenSnapshotOptions));
        } catch {
          /* unreadable trees keep the previous snapshot */
        }
        flushContracts();
      };

      const settleProjectChanges = async (
        changes: readonly ProjectFileChange[],
      ): Promise<void> => {
        let needsContractRescan = false;
        // Deletions must prune or stale controls survive forever; a read that
        // lands mid-write is skipped and retried on the next settled batch.
        for (const change of changes) {
          const normalized = change.absolutePath.split("\\").join("/");
          // fs.watch can report a directory or omit the filename, leaving the
          // source unknown; a bounded rescan is then the only way to stay coherent.
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

        await settleTokens();
      };

      // Extra workspace roots refresh tokens only; contract rescans stay
      // within the app root (nested roots are already covered by the app watcher).
      const additionalRoots = scanRoots.filter(
        (scanRoot) => scanRoot !== fsRoot && !isWithinRoot(fsRoot, scanRoot),
      );
      // Roots can nest; keep only the outermost so one sibling edit settles into one token scan.
      const outerAdditionalRoots = additionalRoots
        .sort((a, b) => a.length - b.length)
        .filter((scanRoot, index, list) =>
          !list.slice(0, index).some((outer) => isWithinRoot(outer, scanRoot)));
      const appWatcher = createProjectFileWatcher({
        rootDirectory: fsRoot,
        debounceMs: 60,
        onSettled: settleProjectChanges,
      });
      await appWatcher.start();
      watchers.push(appWatcher);
      for (const tokenRoot of outerAdditionalRoots) {
        const watcher = createProjectFileWatcher({
          rootDirectory: tokenRoot,
          debounceMs: 60,
          onSettled: async (changes) => {
            // App edits fire this watcher too; the app watcher already covers them,
            // so only changes outside the app need a second scan.
            const outside = isWithinRoot(tokenRoot, fsRoot)
              ? changes.filter((change) => !isWithinRoot(fsRoot, change.absolutePath))
              : changes;
            if (outside.length === 0) return;
            await settleTokens();
          },
        });
        await watcher.start();
        watchers.push(watcher);
      }
    }

    const handle: SidecarHandle = {
      port,
      publishRevision(revision: number): void {
        generation = revision;
        for (const stream of streams) stream.write(`data: ${JSON.stringify({ revision })}\n\n`);
      },
      close(): Promise<void> {
        // Idempotent: the singleton can be closed twice (tests, shutdown race) without throwing.
        if (!server.listening) {
          state.starting = undefined;
          return closeProjectBridge();
        }
        for (const stream of streams) stream.end();
        streams.clear();
        void Promise.all(watchers.map((watcher) => watcher.close().catch(() => {})));
        rmSync(portFilePath(root), { force: true });
        state.starting = undefined;
        const closeServer = new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => (error ? rejectClose(error) : resolveClose()));
        });
        return Promise.all([
          closeServer,
          closeProjectBridge(),
        ]).then(() => undefined);
      },
    };

    return handle;
  })();

  // A failed start must not wedge the singleton (the Symbol.for key survives
  // HMR): clear the slot, identity-checked so a concurrent start is not discarded.
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
  const requestUrl = req.url ?? "";
  const url = requestUrl.split("?")[0];

  if (url === `${NUDGE_UI_ROUTE_PREFIX}contracts` && req.method === "POST") {
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

  if (isNudgeUiEditorDocumentRequest(requestUrl, req.method, req.headers)) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : createNudgeUiEditorDocument());
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }

  if (url === NUDGE_UI_MANIFEST_PATH) {
    const body = `${JSON.stringify({
      ...currentManifest(),
      revision: currentGeneration(),
      ...automationManifestFields(),
    })}\n`;
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }

  if (url === NUDGE_UI_CLIENT_PATH) {
    try {
      inspectorClientPath ??= packageRequire.resolve("nudge-ui/internal/client");
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

  if (url === NUDGE_UI_RELOAD_PATH) {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": nudge-ui reload stream\n\n");
    streams.add(res);
    res.on("close", () => streams.delete(res));
    // Send the current revision first so late subscribers do not miss a change.
    res.write(`data: ${JSON.stringify({ revision: currentGeneration() })}\n\n`);
    return;
  }

  res.writeHead(404).end();
}
