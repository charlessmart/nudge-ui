import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  contentTypeForPath,
  createStandaloneProjectId,
  createStandaloneServer,
  isReservedNudgeUiRoute,
  resolveStaticFile,
  type StandaloneServer,
} from "./server.ts";
import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_RELOAD_PATH,
} from "./manifest.ts";

let runningServer: StandaloneServer | null = null;

afterEach(async () => {
  await runningServer?.close();
  runningServer = null;
});

describe("resolveStaticFile", () => {
  it("handles index files and common path types", async () => {
    const root = await createFixture();
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested/index.html"), "nested");

    expect(resolveStaticFile(root, "/")?.projectPath).toBe("index.html");
    expect(resolveStaticFile(root, "/nested")?.projectPath).toBe("nested/index.html");
    expect(resolveStaticFile(root, "/nested/")?.projectPath).toBe("nested/index.html");
    expect(resolveStaticFile(root, "/missing.txt")).toBeNull();
    expect(contentTypeForPath("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeForPath("styles.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeForPath("script.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeForPath("image.png")).toBe("image/png");
    expect(contentTypeForPath("unknown.bin")).toBe("application/octet-stream");
  });

  it("rejects decoded traversal, malformed escapes, NULs, and backslashes", async () => {
    const root = await createFixture();
    const outside = await mkdtemp(join(tmpdir(), "nudge-ui-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");

    expect(resolveStaticFile(root, "/%2e%2e/" + basename(outside) + "/secret.txt")).toBeNull();
    expect(resolveStaticFile(root, "/%2E%2E/%2Fetc/passwd")).toBeNull();
    expect(resolveStaticFile(root, "/%E0%A4%A")).toBeNull();
    expect(resolveStaticFile(root, "/file%00.txt")).toBeNull();
    expect(resolveStaticFile(root, "/..%5Csecret.txt")).toBeNull();
  });

  it("decodes encoded filenames exactly once", async () => {
    const root = await createFixture();
    const fileName = "percent%name.txt";
    await writeFile(join(root, fileName), "percent file");

    expect(resolveStaticFile(root, `/${encodeURIComponent(fileName)}`)).toMatchObject({
      projectPath: fileName,
    });
  });

  it("rejects symlink escapes even when the requested leaf is missing", async () => {
    const root = await createFixture();
    const outside = await mkdtemp(join(tmpdir(), "nudge-ui-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "linked-outside"), "dir");

    expect(resolveStaticFile(root, "/linked-outside/secret.txt")).toBeNull();
    expect(resolveStaticFile(root, "/linked-outside/new-file.txt")).toBeNull();
  });

  it("refuses hidden and sensitive paths, including encoded and symlinked forms", async () => {
    const root = await createFixture();
    await writeFile(join(root, ".env"), "SECRET=value");
    await writeFile(join(root, ".env.local"), "LOCAL_SECRET=value");
    await writeFile(join(root, ".DS_Store"), "metadata");
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "[remote]\n");
    await mkdir(join(root, ".codex"));
    await writeFile(join(root, ".codex", "config.toml"), "secret = true\n");
    await symlink(join(root, ".codex"), join(root, "codex-link"), "dir");

    for (const requestPath of [
      "/.env",
      "/.env.local",
      "/.DS_Store",
      "/.git/config",
      "/.codex/config.toml",
      "/%2eenv",
      "/%2Egit/config",
      "/%2ecodex/config.toml",
      "/%252eenv",
      "/%252Egit/config",
      "/codex-link/config.toml",
    ]) {
      expect(resolveStaticFile(root, requestPath), requestPath).toBeNull();
    }
  });

  it("allows symlinks that resolve within the project root", async () => {
    const root = await createFixture();
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets/inside.txt"), "inside");
    await symlink(join(root, "assets"), join(root, "linked-inside"), "dir");

    expect(resolveStaticFile(root, "/linked-inside/inside.txt")).toMatchObject({
      projectPath: "assets/inside.txt",
    });
  });
});

describe("createStandaloneServer", () => {
  it("serves transformed HTML without changing source bytes", async () => {
    const root = await createFixture();
    const originalHtml = "<!doctype html>\n<body><button>Save</button></body>\n";
    await writeFile(join(root, "index.html"), originalHtml);
    await writeFile(join(root, "styles.css"), "button { color: red; }");
    await writeFile(join(root, "script.js"), "const markup = '<button>not HTML';");
    await mkdir(join(root, "__nudge_ui__"));
    await writeFile(join(root, "__nudge_ui__", "manifest"), "shadow");
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export const testClient = true;");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();
    expect(address.port).toBeGreaterThan(0);
    expect(address.url).toContain("127.0.0.1");

    const htmlResponse = await fetch(address.url + "index.html");
    const html = await htmlResponse.text();
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("data-src=\"index.html:2:7\"");
    expect(html).toContain("src=\"" + NUDGE_UI_CLIENT_PATH + "\"");
    expect(html).toContain("data-nudge-ui-manifest=\"" + NUDGE_UI_MANIFEST_PATH + "\"");
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(originalHtml);

    const cssResponse = await fetch(address.url + "styles.css");
    expect(cssResponse.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await cssResponse.text()).toBe("button { color: red; }");

    const jsResponse = await fetch(address.url + "script.js");
    expect(await jsResponse.text()).toBe("const markup = '<button>not HTML';");

    const headResponse = await fetch(address.url + "styles.css", { method: "HEAD" });
    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe("");
    expect(headResponse.headers.get("content-length")).toBe(
      String(Buffer.byteLength("button { color: red; }")),
    );

    const manifestResponse = await fetch(address.url + NUDGE_UI_MANIFEST_PATH.slice(1));
    const manifest = await manifestResponse.json() as {
      runtime: {
        projectId: string;
        host: string;
        framework: string;
        stylingSystem: string;
        capabilities: { canvas: boolean; componentSemantics: boolean };
        tokenCatalog: unknown[];
        tokens: unknown[];
        tokenDiagnostics: unknown[];
        tokenGeneration: string;
        componentContracts: unknown[];
      };
    };
    expect(manifestResponse.status).toBe(200);
    expect(manifest).toMatchObject({ revision: 0 });
    expect(manifest).toMatchObject({
      version: 1,
      document: { runtimeIdentity: "static-html", stylesheetOrder: "browser" },
      reload: {
        endpoint: NUDGE_UI_RELOAD_PATH,
        strategy: "reload-document",
        events: ["ready", "reload"],
      },
    });
    expect(manifest.runtime).toMatchObject({
      projectId: runningServer.projectId,
      host: "static-html",
      framework: "HTML",
      stylingSystem: "CSS custom properties",
      capabilities: { canvas: true, componentSemantics: false },
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      componentContracts: [],
    });
    expect(manifest.runtime.tokenGeneration).toMatch(/^static-html:/);

    const reservedShadow = await fetch(address.url + "__nudge_ui__/manifest");
    expect(reservedShadow.status).toBe(200);
    expect(await reservedShadow.text()).not.toBe("shadow");
    const reservedUnknown = await fetch(address.url + "__nudge_ui__/prototype.js");
    expect(reservedUnknown.status).toBe(404);
    const missing = await fetch(address.url + "does-not-exist.txt");
    expect(missing.status).toBe(404);
  });

  it("returns not found for hidden project files", async () => {
    const root = await createFixture();
    await writeFile(join(root, ".env"), "SECRET=value");
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "[remote]\n");
    await mkdir(join(root, ".codex"));
    await writeFile(join(root, ".codex", "config.toml"), "secret = true\n");
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};\n");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();

    for (const requestPath of [
      ".env",
      ".git/config",
      ".codex/config.toml",
      "%2eenv",
      "%2Egit/config",
      "%252eenv",
    ]) {
      const response = await fetch(address.url + requestPath);
      expect(response.status, requestPath).toBe(404);
    }
  });

  it("serves non-UTF-8 HTML byte-for-byte without instrumentation", async () => {
    const root = await createFixture();
    // "café" encoded in ISO-8859-1: 0xE1 is invalid UTF-8 and must survive.
    const latin1Bytes = Buffer.from(
      "<!doctype html>\n<body><button>Caf\xe9</button></body>\n",
      "latin1",
    );
    await writeFile(join(root, "index.html"), latin1Bytes);
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();

    const response = await fetch(address.url + "index.html");
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(body.equals(latin1Bytes)).toBe(true);
    expect(body.includes("data-cid")).toBe(false);
  });

  it("answers HTML HEAD requests without transforming and omits content length", async () => {
    const root = await createFixture();
    await writeFile(
      join(root, "index.html"),
      "<!doctype html><body><button>Save</button></body>",
    );
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();

    const headResponse = await fetch(address.url + "index.html", { method: "HEAD" });
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(headResponse.headers.get("cache-control")).toBe("no-cache");
    expect(headResponse.headers.get("content-length")).toBeNull();
    expect(await headResponse.text()).toBe("");
  });

  it("serves transformed HTML with no-cache revalidation", async () => {
    const root = await createFixture();
    await writeFile(join(root, "index.html"), "<!doctype html><body>fixture</body>");
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();

    const htmlResponse = await fetch(address.url + "index.html");
    expect(htmlResponse.headers.get("cache-control")).toBe("no-cache");
  });

  it("maps additional common asset types", () => {
    expect(contentTypeForPath("clip.mp4")).toBe("video/mp4");
    expect(contentTypeForPath("doc.pdf")).toBe("application/pdf");
    expect(contentTypeForPath("app.webmanifest")).toBe("application/manifest+json");
    expect(contentTypeForPath("photo.avif")).toBe("image/avif");
    expect(contentTypeForPath("readme.md")).toBe("text/markdown; charset=utf-8");
  });

  it("serves percent-containing filenames and rejects encoded traversal", async () => {
    const root = await createFixture();
    const fileName = "percent%name.txt";
    await writeFile(join(root, fileName), "percent file");
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");

    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const address = await runningServer.start();

    const fileResponse = await fetch(address.url + encodeURIComponent(fileName));
    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.text()).toBe("percent file");

    const traversalResponse = await fetch(address.url + "%2e%2e/secret.txt");
    // Fetch normalizes dot segments before sending this URL; the resulting
    // request is still rejected and never serves a file outside the root.
    expect(traversalResponse.status).toBe(404);
  });

  it("produces a stable identity and enforces loopback binding", async () => {
    const root = await createFixture();
    expect(createStandaloneProjectId(root)).toBe(createStandaloneProjectId(root));
    expect(() => createStandaloneServer({
      rootDirectory: root,
      host: "0.0.0.0" as "127.0.0.1",
    })).toThrow(/loopback/);
  });

  it("reports port conflicts and releases the port after close", async () => {
    const root = await createFixture();
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");
    const first = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });
    const firstAddress = await first.start();
    const conflicting = createStandaloneServer({
      rootDirectory: root,
      port: firstAddress.port,
      clientPath,
    });

    await expect(conflicting.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await first.close();

    runningServer = createStandaloneServer({
      rootDirectory: root,
      port: firstAddress.port,
      clientPath,
    });
    await expect(runningServer.start()).resolves.toMatchObject({
      port: firstAddress.port,
    });
  });

  it("cancels an in-flight start before leaving a listening server", async () => {
    const root = await createFixture();
    const clientPath = join(root, "test-client.mjs");
    await writeFile(clientPath, "export {};");
    runningServer = createStandaloneServer({ rootDirectory: root, port: 0, clientPath });

    const startPromise = runningServer.start();
    const closePromise = runningServer.close();

    await expect(startPromise).rejects.toThrow(/closed during startup/);
    await expect(closePromise).resolves.toBeUndefined();
    expect(runningServer.httpServer.listening).toBe(false);
  });

  it("publishes rebuilt token knowledge before one settled reload", async () => {
    const root = await createFixture();
    const clientPath = join(root, "test-client.mjs");
    const cssPath = join(root, "theme.css");
    await writeFile(clientPath, "export {};");
    await writeFile(cssPath, ":root { --tone: red; }");
    runningServer = createStandaloneServer({
      rootDirectory: root,
      port: 0,
      clientPath,
      watchDebounceMs: 40,
    });
    const address = await runningServer.start();
    const streamResponse = await fetch(address.url + NUDGE_UI_RELOAD_PATH.slice(1));
    const reader = streamResponse.body!.getReader();
    await readSseEvent(reader, "ready");

    await writeFile(cssPath, ":root { --tone: blue; }");
    await writeFile(cssPath, ":root { --tone: green; }");

    const reloadEvent = await readSseEvent(reader, "reload");
    const manifestResponse = await fetch(address.url + NUDGE_UI_MANIFEST_PATH.slice(1));
    const manifest = await manifestResponse.json() as {
      revision: number;
      runtime: { tokens: Array<{ cssName?: string; value: string }> };
    };
    expect(reloadEvent).toContain('"revision":1');
    expect(manifest.revision).toBe(1);
    expect(manifest.runtime.tokens).toEqual([
      expect.objectContaining({ cssName: "--tone", value: "green" }),
    ]);
    await reader.cancel();
  });
});

describe("standalone build", () => {
  it("emits an executable Node CLI bundle", () => {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const script = join(packageRoot, "scripts/build.mjs");
    execFileSync(process.execPath, [script], { cwd: packageRoot, stdio: "pipe" });
    const cli = join(packageRoot, "bin/nudge-ui.mjs");

    const result = spawnSync(process.execPath, [cli, "unknown"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: nudge-ui serve");
    expect(result.stderr).not.toContain("Dynamic require");
  });
});

describe("reserved route helper", () => {
  it("reserves the Nudge UI namespace before file resolution", () => {
    expect(isReservedNudgeUiRoute("/__nudge_ui__")).toBe(true);
    expect(isReservedNudgeUiRoute("/__nudge_ui__/manifest")).toBe(true);
    expect(isReservedNudgeUiRoute("/__nudge_ui__/anything")).toBe(true);
    expect(isReservedNudgeUiRoute("/prototype/index.html")).toBe(false);
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nudge-ui-standalone-"));
  await writeFile(join(root, "index.html"), "<!doctype html><body>fixture</body>");
  return root;
}

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  eventName: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let received = "";
  const deadline = Date.now() + 3_000;
  while (!received.includes(`event: ${eventName}\n`)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${eventName} event.`);
    const result = await readWithTimeout(reader, eventName, remaining);
    if (result.done) throw new Error(`Reload stream closed before ${eventName} event.`);
    received += decoder.decode(result.value, { stream: true });
  }
  return received;
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  eventName: string,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${eventName} event.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
