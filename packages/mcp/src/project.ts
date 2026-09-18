import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { AGENT_PROTOCOL_VERSION, canonicalOrigin } from "@nudge-ui/agent-protocol";
import { createLoopbackBridge, type BridgeAddress, type BrowserBridge } from "./bridge.ts";

const execFileAsync = promisify(execFile);
const REGISTRY_SCHEMA_VERSION = 1 as const;

export interface ProjectSession {
  readonly schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly sessionId: string;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly appRoot: string;
  readonly gitCommonDir?: string;
  readonly branch?: string;
  readonly origin: string;
  readonly endpoint: string;
  readonly startedAt: string;
}

export interface ProjectBridgeOptions {
  readonly appRoot: string;
  readonly workspaceRoot?: string;
  readonly projectId?: string;
  readonly origin: string;
  /** Other explicit browser origins, such as loopback aliases on the same port. */
  readonly allowedOrigins?: readonly string[];
  readonly host?: "127.0.0.1" | "::1" | "localhost";
  readonly port?: number;
  readonly commandTimeoutMs?: number;
  /** Test/embedding override. Production uses a private per-user directory. */
  readonly registryRoot?: string;
}

export interface ProjectBridgeRuntime {
  readonly bridge: BrowserBridge;
  readonly address: BridgeAddress;
  readonly session: ProjectSession;
  readonly browser: {
    readonly projectId: string;
    readonly origin: string;
    readonly bridgeUrl: string;
  };
  close(): Promise<void>;
}

export interface StoredProjectSession extends ProjectSession {
  readonly pid: number;
  readonly controlToken: string;
}

export function defaultSessionRegistryRoot(): string {
  // MCP hosts commonly sanitize TMPDIR and XDG_RUNTIME_DIR for stdio child
  // processes. The OS account home is stable across the development server
  // and agent adapter, so both processes discover the same private registry.
  return join(userInfo().homedir, ".cache", "nudge-ui", "sessions");
}

async function gitValue(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 2_000,
      windowsHide: true,
    });
    const value = result.stdout.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function workspaceMetadata(appRootInput: string, workspaceRootInput?: string): Promise<{
  appRoot: string;
  workspaceRoot: string;
  gitCommonDir?: string;
  branch?: string;
}> {
  const appRoot = await realpath(resolve(appRootInput));
  const requestedWorkspace = workspaceRootInput === undefined
    ? undefined
    : await realpath(resolve(workspaceRootInput));
  const gitTopLevel = await gitValue(requestedWorkspace ?? appRoot, ["rev-parse", "--show-toplevel"]);
  const workspaceRoot = gitTopLevel ? await realpath(gitTopLevel) : (requestedWorkspace ?? appRoot);
  const appRelative = relative(workspaceRoot, appRoot);
  if (appRelative === ".." || appRelative.startsWith(`..${sep}`) || isAbsolute(appRelative)) {
    throw new TypeError("appRoot must be inside the canonical workspace root");
  }
  const commonDirectory = await gitValue(workspaceRoot, ["rev-parse", "--git-common-dir"]);
  const gitCommonDir = commonDirectory === undefined
    ? undefined
    : await realpath(resolve(workspaceRoot, commonDirectory));
  const branch = await gitValue(workspaceRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return { appRoot, workspaceRoot, ...(gitCommonDir ? { gitCommonDir } : {}), ...(branch ? { branch } : {}) };
}

/** Resolves a checkout or worktree without conflating related worktrees. */
export async function resolveWorkspaceRoot(input: string): Promise<string> {
  const canonicalInput = await realpath(resolve(input));
  const gitTopLevel = await gitValue(canonicalInput, ["rev-parse", "--show-toplevel"]);
  return gitTopLevel ? await realpath(gitTopLevel) : canonicalInput;
}

function sessionPath(registryRoot: string, sessionId: string): string {
  return join(registryRoot, `${sessionId}.json`);
}

async function writeDescriptor(registryRoot: string, descriptor: StoredProjectSession): Promise<string> {
  await mkdir(registryRoot, { recursive: true, mode: 0o700 });
  const directory = await lstat(registryRoot);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("The Nudge session registry must be a real directory.");
  }
  if (typeof process.getuid === "function" && directory.uid !== process.getuid()) {
    throw new Error("The Nudge session registry must be owned by the current user.");
  }
  await chmod(registryRoot, 0o700);
  const destination = sessionPath(registryRoot, descriptor.sessionId);
  const temporary = join(registryRoot, `.${descriptor.sessionId}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(descriptor)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
  await chmod(destination, 0o600);
  return destination;
}

/**
 * Starts the project-owned browser bridge and registers it for local MCP
 * adapters. The descriptor contains a private control credential and is never
 * suitable for browser bundles or user-facing tool results.
 */
export async function startProjectBridge(options: ProjectBridgeOptions): Promise<ProjectBridgeRuntime> {
  const origin = canonicalOrigin(options.origin);
  if (!origin) throw new TypeError("origin must be a canonical HTTP(S) origin");
  const metadata = await workspaceMetadata(options.appRoot, options.workspaceRoot);
  const sessionId = randomUUID();
  const projectId = options.projectId ?? basename(metadata.appRoot);
  if (!projectId) throw new TypeError("projectId must be a bounded non-empty string");
  const controlToken = randomBytes(32).toString("base64url");
  const bridge = createLoopbackBridge({
    projectId,
    origin,
    allowedOrigins: options.allowedOrigins,
    host: options.host,
    port: options.port,
    commandTimeoutMs: options.commandTimeoutMs,
    agentControlToken: controlToken,
  });
  const address = await bridge.start();
  const session: ProjectSession = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    sessionId,
    projectId,
    workspaceRoot: metadata.workspaceRoot,
    appRoot: metadata.appRoot,
    ...(metadata.gitCommonDir ? { gitCommonDir: metadata.gitCommonDir } : {}),
    ...(metadata.branch ? { branch: metadata.branch } : {}),
    origin,
    endpoint: address.url,
    startedAt: new Date().toISOString(),
  };
  const registryRoot = resolve(options.registryRoot ?? defaultSessionRegistryRoot());
  let descriptorPath: string;
  try {
    descriptorPath = await writeDescriptor(registryRoot, { ...session, pid: process.pid, controlToken });
  } catch (error) {
    await bridge.close();
    throw error;
  }
  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      await rm(descriptorPath, { force: true });
      await bridge.close();
    })();
    return closePromise;
  };
  return {
    bridge,
    address,
    session,
    browser: { projectId, origin, bridgeUrl: address.url },
    close,
  };
}
