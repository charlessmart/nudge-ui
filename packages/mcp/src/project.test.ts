import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveredProjectRouter, discoverProjectSessions } from "./discovery.ts";
import { defaultSessionRegistryRoot, startProjectBridge, type ProjectBridgeRuntime } from "./project.ts";

const running: ProjectBridgeRuntime[] = [];
const routers: DiscoveredProjectRouter[] = [];
const listeners: ReturnType<DiscoveredProjectRouter["waitForPrompt"]>[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  try {
    await Promise.all(routers.splice(0).map((router) => router.close()));
  } finally {
    await Promise.all(running.splice(0).map((runtime) => runtime.close()));
    await Promise.allSettled(listeners.splice(0));
  }
});

async function fixture(name: string): Promise<{ registryRoot: string; workspaceRoot: string; appRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), `nudge-mcp-${name}-`));
  const registryRoot = join(root, "registry");
  const workspaceRoot = join(root, "workspace");
  const appRoot = join(workspaceRoot, "apps", "site");
  await mkdir(appRoot, { recursive: true });
  return { registryRoot, workspaceRoot, appRoot };
}

async function dispatch(runtime: ProjectBridgeRuntime, prompt: string): Promise<Response> {
  const pairing = runtime.bridge.pairBrowser(runtime.session.projectId, runtime.session.origin);
  return await fetch(`${runtime.address.url}/prompt`, {
    method: "POST",
    headers: { Origin: runtime.session.origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: runtime.session.projectId,
      sessionToken: pairing.sessionToken,
      prompt,
    }),
  });
}

async function createRouter(workspaceRoot: string, registryRoot: string): Promise<DiscoveredProjectRouter> {
  const router = await DiscoveredProjectRouter.create(workspaceRoot, registryRoot);
  routers.push(router);
  return router;
}

function trackListener(request: ReturnType<DiscoveredProjectRouter["waitForPrompt"]>) {
  // Observe errors immediately, including when readiness fails before the test awaits the request.
  void request.catch(() => undefined);
  listeners.push(request);
  return request;
}

async function waitForListener(runtime: ProjectBridgeRuntime): Promise<void> {
  await vi.waitFor(() => {
    expect(runtime.bridge.getStatus().listenerActive, "MCP adapter opens its listener").toBe(true);
  }, { timeout: 2_000, interval: 10 });
}

async function waitForNoListener(runtime: ProjectBridgeRuntime): Promise<void> {
  await vi.waitFor(() => {
    expect(runtime.bridge.getStatus().listenerActive, "MCP adapter closes its listener").toBe(false);
  }, { timeout: 2_000, interval: 10 });
}

describe("project-owned MCP sessions", () => {
  it("uses a registry location that is stable when an MCP host sanitizes TMPDIR", () => {
    const original = process.env.TMPDIR;
    process.env.TMPDIR = "/one-process-temp";
    const developmentServerPath = defaultSessionRegistryRoot();
    process.env.TMPDIR = "/different-adapter-temp";
    const adapterPath = defaultSessionRegistryRoot();
    if (original === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = original;

    expect(adapterPath).toBe(developmentServerPath);
  });

  it("discovers live sessions without exposing credentials and preserves exact workspace isolation", async () => {
    const first = await fixture("first");
    const second = await fixture("second");
    const firstRuntime = await startProjectBridge({ ...first, origin: "http://localhost:5173", port: 0 });
    const secondRuntime = await startProjectBridge({
      workspaceRoot: second.workspaceRoot,
      appRoot: second.appRoot,
      registryRoot: first.registryRoot,
      origin: "http://localhost:5174",
      port: 0,
    });
    running.push(firstRuntime, secondRuntime);

    const sessions = await discoverProjectSessions(first.workspaceRoot, first.registryRoot);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.matchesWorkspace).map((session) => session.sessionId))
      .toEqual([firstRuntime.session.sessionId]);
    expect(JSON.stringify(sessions)).not.toContain("controlToken");

    const descriptor = join(first.registryRoot, `${firstRuntime.session.sessionId}.json`);
    expect((await stat(descriptor)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(descriptor, "utf8"))).toHaveProperty("controlToken");

    const router = await createRouter(first.workspaceRoot, first.registryRoot);
    await expect(router.waitForPrompt(undefined, secondRuntime.session.sessionId))
      .rejects.toThrow("not live in this exact workspace");
    const listening = trackListener(router.waitForPrompt());
    await waitForListener(firstRuntime);
    expect((await dispatch(firstRuntime, "Change the local worktree heading")).status).toBe(202);
    await expect(listening).resolves.toMatchObject({ prompt: "Change the local worktree heading" });
    await router.close();
  });

  it("resolves a symlinked app inside a non-Git workspace", async () => {
    const paths = await fixture("canonical-paths");
    const alias = join(paths.workspaceRoot, "site-alias");
    await symlink(paths.appRoot, alias);
    const runtime = await startProjectBridge({ ...paths, appRoot: alias, origin: "http://localhost:5173" });
    running.push(runtime);

    expect(runtime.session.appRoot).toBe(await realpath(paths.appRoot));
    expect(runtime.session.workspaceRoot).toBe(await realpath(paths.workspaceRoot));
    expect(runtime.session.branch).toBeUndefined();
    expect(runtime.session.gitCommonDir).toBeUndefined();
  });

  it("rejects an app outside the requested workspace", async () => {
    const paths = await fixture("outside-workspace");
    const outside = await fixture("unrelated-app");
    await expect(startProjectBridge({ ...paths, appRoot: outside.appRoot, origin: "http://localhost:5173" }))
      .rejects.toThrow("appRoot must be inside the canonical workspace root");
  });

  it("rejects a symlinked registry directory", async () => {
    const paths = await fixture("symlink-registry");
    const target = join(paths.workspaceRoot, "registry-target");
    await mkdir(target);
    await symlink(target, paths.registryRoot);
    await expect(startProjectBridge({ ...paths, origin: "http://localhost:5173" }))
      .rejects.toThrow("The Nudge session registry must be a real directory");
  });

  it("closes the bridge even when its descriptor cannot be removed", async () => {
    const paths = await fixture("failed-unregister");
    const runtime = await startProjectBridge({ ...paths, origin: "http://localhost:5173" });
    const descriptorPath = join(paths.registryRoot, `${runtime.session.sessionId}.json`);
    try {
      // A directory in place of the descriptor makes non-recursive removal fail.
      await rm(descriptorPath);
      await mkdir(descriptorPath);
      await expect(runtime.close()).rejects.toThrow();
      await expect(fetch(`${runtime.address.url}/health`)).rejects.toThrow();
    } finally {
      await runtime.bridge.close();
      await rm(descriptorPath, { recursive: true, force: true });
    }
  });

  it("allows one adapter to own a session through work and status reporting", async () => {
    const paths = await fixture("claim");
    const runtime = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    running.push(runtime);
    const owner = await createRouter(paths.workspaceRoot, paths.registryRoot);
    const competitor = await createRouter(paths.workspaceRoot, paths.registryRoot);
    const listening = trackListener(owner.waitForPrompt());
    await waitForListener(runtime);

    await expect(competitor.waitForPrompt()).rejects.toThrow("Another MCP adapter owns");
    expect((await dispatch(runtime, "Keep ownership while implementing")).status).toBe(202);
    const request = await listening;
    await owner.updateRequestStatus({ requestId: request.requestId, status: "completed", summary: "Done" });
    await expect(competitor.waitForPrompt()).rejects.toThrow("Another MCP adapter owns");

    await owner.close();
    await expect(competitor.getStatus()).resolves.toMatchObject({ request: { status: "completed" } });
    await competitor.close();
  });

  it("releases an active listener so another adapter can claim the session", async () => {
    const paths = await fixture("release");
    const runtime = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    running.push(runtime);
    const owner = await createRouter(paths.workspaceRoot, paths.registryRoot);
    const replacement = await createRouter(paths.workspaceRoot, paths.registryRoot);
    const abandonedListener = trackListener(owner.waitForPrompt());
    await waitForListener(runtime);

    await owner.release();
    await expect(abandonedListener).rejects.toThrow("released the project session");
    const replacementListener = trackListener(replacement.waitForPrompt());
    await waitForListener(runtime);
    expect((await dispatch(runtime, "Continue in the replacement agent")).status).toBe(202);
    await expect(replacementListener).resolves.toMatchObject({ prompt: "Continue in the replacement agent" });

    await replacement.release();
  });

  it("reconnects to a restarted bridge for the same app without replaying state", async () => {
    const paths = await fixture("restart");
    const first = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    running.push(first);
    const router = await createRouter(paths.workspaceRoot, paths.registryRoot);
    await router.getStatus();
    await first.close();
    running.splice(running.indexOf(first), 1);

    const restarted = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    running.push(restarted);
    const listening = trackListener(router.waitForPrompt());
    await waitForListener(restarted);
    expect((await dispatch(restarted, "Request after restart")).status).toBe(202);
    await expect(listening).resolves.toMatchObject({ prompt: "Request after restart" });
    expect(restarted.bridge.getStatus().request).toMatchObject({ status: "working" });
    await router.close();
  });

  it("distinguishes a linked worktree from a clone on the same branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "nudge-mcp-git-"));
    const repository = join(root, "repository");
    const worktree = join(root, "worktree");
    const clone = join(root, "clone");
    const registryRoot = join(root, "registry");
    await mkdir(join(repository, "apps", "site"), { recursive: true });
    await writeFile(join(repository, "apps", "site", "fixture.txt"), "fixture\n");
    await execFileAsync("git", ["init", repository]);
    await execFileAsync("git", ["-C", repository, "add", "."]);
    await execFileAsync("git", ["-C", repository, "-c", "user.name=Nudge Test", "-c", "user.email=nudge@example.test", "commit", "-m", "fixture"]);
    await execFileAsync("git", ["-C", repository, "worktree", "add", "-b", "feature/session-discovery", worktree]);
    await execFileAsync("git", ["clone", repository, clone]);
    await execFileAsync("git", ["-C", clone, "checkout", "feature/session-discovery"]);

    const worktreeRuntime = await startProjectBridge({
      appRoot: join(worktree, "apps", "site"),
      registryRoot,
      origin: "http://localhost:5173",
      port: 0,
    });
    const cloneRuntime = await startProjectBridge({
      appRoot: join(clone, "apps", "site"),
      registryRoot,
      origin: "http://localhost:5174",
      port: 0,
    });
    running.push(worktreeRuntime, cloneRuntime);

    const sessions = await discoverProjectSessions(worktree, registryRoot);
    expect(sessions.find((session) => session.sessionId === worktreeRuntime.session.sessionId)).toMatchObject({
      matchesWorkspace: true,
      branch: "feature/session-discovery",
    });
    expect(sessions.find((session) => session.sessionId === cloneRuntime.session.sessionId)).toMatchObject({
      matchesWorkspace: false,
      branch: "feature/session-discovery",
    });
    expect(worktreeRuntime.session.gitCommonDir).not.toBe(cloneRuntime.session.gitCommonDir);
  });

  it("uses the requested app path to select one app in a monorepo", async () => {
    const paths = await fixture("monorepo");
    const otherApp = join(paths.workspaceRoot, "apps", "admin");
    await mkdir(otherApp, { recursive: true });
    await execFileAsync("git", ["init", paths.workspaceRoot]);
    const site = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    const admin = await startProjectBridge({
      workspaceRoot: paths.workspaceRoot,
      appRoot: otherApp,
      registryRoot: paths.registryRoot,
      origin: "http://localhost:5174",
      port: 0,
    });
    running.push(site, admin);
    const router = await createRouter(otherApp, paths.registryRoot);

    await expect(router.getStatus()).resolves.toMatchObject({ projectId: "admin" });
    const sessions = await router.listSessions();
    expect(sessions.find((session) => session.sessionId === admin.session.sessionId)?.claimed).toBe(false);
    expect(sessions.find((session) => session.sessionId === site.session.sessionId)?.claimed).toBe(false);
    await router.close();
  });

  it("does not route an application-scoped adapter to the only other app in its workspace", async () => {
    const paths = await fixture("app-affinity");
    const otherApp = join(paths.workspaceRoot, "apps", "admin");
    await mkdir(otherApp, { recursive: true });
    await execFileAsync("git", ["init", paths.workspaceRoot]);
    const admin = await startProjectBridge({
      workspaceRoot: paths.workspaceRoot,
      appRoot: otherApp,
      registryRoot: paths.registryRoot,
      origin: "http://localhost:5174",
      port: 0,
    });
    running.push(admin);
    const siteRouter = await createRouter(paths.appRoot, paths.registryRoot);

    await expect(siteRouter.getStatus()).rejects.toThrow("exact application");
    await expect(siteRouter.waitForPrompt(undefined, admin.session.sessionId)).rejects.toThrow("exact application");
    expect(admin.bridge.getStatus().listenerActive).toBe(false);
    await siteRouter.close();
  });

  it("ignores stale descriptors and clears an aborted listener without releasing ownership", async () => {
    const paths = await fixture("stale");
    const runtime = await startProjectBridge({ ...paths, origin: "http://localhost:5173", port: 0 });
    running.push(runtime);
    const descriptorPath = join(paths.registryRoot, `${runtime.session.sessionId}.json`);
    const staleDescriptor = await readFile(descriptorPath, "utf8");
    const router = await createRouter(paths.workspaceRoot, paths.registryRoot);
    const abort = new AbortController();
    const listening = trackListener(router.waitForPrompt(abort.signal));
    await waitForListener(runtime);
    abort.abort();
    await expect(listening).rejects.toThrow();
    await waitForNoListener(runtime);
    await expect(router.getStatus()).resolves.toMatchObject({ listenerActive: false });
    await router.close();

    await runtime.close();
    running.splice(running.indexOf(runtime), 1);
    await writeFile(descriptorPath, staleDescriptor, { mode: 0o600 });
    await expect(discoverProjectSessions(paths.workspaceRoot, paths.registryRoot)).resolves.toEqual([]);
  });
});
