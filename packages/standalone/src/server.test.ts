import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  contentTypeForPath,
  createStandaloneProjectId,
  createStandaloneServer,
  isReservedDesignToolRoute,
  resolveStaticFile,
  type StandaloneServer,
} from "./server.ts";
import {
  DESIGN_TOOL_CLIENT_PATH,
  DESIGN_TOOL_MANIFEST_PATH,
  DESIGN_TOOL_RELOAD_PATH,
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
    const outside = await mkdtemp(join(tmpdir(), "design-tool-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");

    expect(resolveStaticFile(root, "/%2e%2e/" + basename(outside) + "/secret.txt")).toBeNull();
    expect(resolveStaticFile(root, "/%2E%2E/%2Fetc/passwd")).toBeNull();
    expect(resolveStaticFile(root, "/%E0%A4%A")).toBeNull();
    expect(resolveStaticFile(root, "/file%00.txt")).toBeNull();
    expect(resolveStaticFile(root, "/..%5Csecret.txt")).toBeNull();
  });

  it("rejects symlink escapes even when the requested leaf is missing", async () => {
    const root = await createFixture();
    const outside = await mkdtemp(join(tmpdir(), "design-tool-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "linked-outside"), "dir");

    expect(resolveStaticFile(root, "/linked-outside/secret.txt")).toBeNull();
    expect(resolveStaticFile(root, "/linked-outside/new-file.txt")).toBeNull();
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
    await mkdir(join(root, "__design_tool__"));
    await writeFile(join(root, "__design_tool__", "manifest"), "shadow");
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
    expect(html).toContain("src=\"" + DESIGN_TOOL_CLIENT_PATH + "\"");
    expect(html).toContain("data-design-tool-manifest=\"" + DESIGN_TOOL_MANIFEST_PATH + "\"");
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

    const manifestResponse = await fetch(address.url + DESIGN_TOOL_MANIFEST_PATH.slice(1));
    const manifest = await manifestResponse.json() as {
      runtime: {
        projectId: string;
        host: string;
        framework: string;
        stylingSystem: string;
        tokenCatalog: unknown[];
        tokens: unknown[];
        tokenDiagnostics: unknown[];
        tokenGeneration: string;
        componentContracts: unknown[];
      };
    };
    expect(manifestResponse.status).toBe(200);
    expect(manifest).toMatchObject({ revision: 0 });
    expect(manifest.runtime).toMatchObject({
      projectId: runningServer.projectId,
      host: "static-html",
      framework: "HTML",
      stylingSystem: "CSS custom properties",
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      componentContracts: [],
    });
    expect(manifest.runtime.tokenGeneration).toMatch(/^static-html:/);

    const reservedShadow = await fetch(address.url + "__design_tool__/manifest");
    expect(reservedShadow.status).toBe(200);
    expect(await reservedShadow.text()).not.toBe("shadow");
    const reservedUnknown = await fetch(address.url + "__design_tool__/prototype.js");
    expect(reservedUnknown.status).toBe(404);
    const missing = await fetch(address.url + "does-not-exist.txt");
    expect(missing.status).toBe(404);
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
    const streamResponse = await fetch(address.url + DESIGN_TOOL_RELOAD_PATH.slice(1));
    const reader = streamResponse.body!.getReader();
    await readSseEvent(reader, "ready");

    await writeFile(cssPath, ":root { --tone: blue; }");
    await writeFile(cssPath, ":root { --tone: green; }");

    const reloadEvent = await readSseEvent(reader, "reload");
    const manifestResponse = await fetch(address.url + DESIGN_TOOL_MANIFEST_PATH.slice(1));
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

describe("standalone client build", () => {
  it("emits a self-contained browser module", () => {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const script = join(packageRoot, "scripts/build-client.mjs");
    execFileSync(process.execPath, [script], { cwd: packageRoot, stdio: "pipe" });
    const bundle = readFileSync(join(packageRoot, "dist/client.mjs"), "utf8");

    expect(bundle).not.toContain("virtual:design-");
    expect(bundle).not.toContain("/@vite/client");
    expect(bundle).not.toContain("?inline");
    expect(bundle).not.toContain("import.meta.env");
    expect(bundle).not.toMatch(/^import\s/m);
    expect(bundle).toContain("react.development.js");
    expect(bundle).toContain("configureDesignToolRuntime");
    expect(bundle).toContain("bootstrapDesignTool");
  });
});

describe("reserved route helper", () => {
  it("reserves the Design Tool namespace before file resolution", () => {
    expect(isReservedDesignToolRoute("/__design_tool__")).toBe(true);
    expect(isReservedDesignToolRoute("/__design_tool__/manifest")).toBe(true);
    expect(isReservedDesignToolRoute("/__design_tool__/anything")).toBe(true);
    expect(isReservedDesignToolRoute("/prototype/index.html")).toBe(false);
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "design-tool-standalone-"));
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
