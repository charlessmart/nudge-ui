import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withNudgeUi, type NudgeUiMetroConfig } from "./config.ts";
import { closeExpoDevServer } from "./devServer.ts";
import { EXPO_TRANSFORM_SETTINGS_ENV, EXPO_UPSTREAM_TRANSFORMER_ENV, readExpoTransformSettings } from "./transform.ts";

const PACKAGE_ROOT = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));

let root: string;
let server: Server | null = null;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "nudge-expo-config-")));
  mkdirSync(join(root, "components"));
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(
    join(root, "components", "RideCard.tsx"),
    "export function RideCard({ title }: { title: string }) { return <div>{title}</div>; }\n",
  );
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NUDGE_UI", "");
  vi.stubEnv(EXPO_TRANSFORM_SETTINGS_ENV, "");
  vi.stubEnv(EXPO_UPSTREAM_TRANSFORMER_ENV, "");
  delete process.env[EXPO_UPSTREAM_TRANSFORMER_ENV];
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = null;
  await closeExpoDevServer(root);
  rmSync(root, { recursive: true, force: true });
});

function expoConfig(overrides: Partial<NudgeUiMetroConfig> = {}): NudgeUiMetroConfig {
  return {
    projectRoot: root,
    watchFolders: [],
    transformer: { babelTransformerPath: "/expo/metro-config/babel-transformer.js" },
    resolver: {},
    serializer: { getPolyfills: ({ platform }) => (platform ? ["/polyfills/js.js"] : []) },
    server: {},
    ...overrides,
  };
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("withNudgeUi for Expo", () => {
  it("returns the config untouched outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = expoConfig();
    expect(withNudgeUi(config)).toBe(config);
  });

  it("returns the config untouched when turned off", () => {
    const config = expoConfig();
    expect(withNudgeUi(config, { enabled: false })).toBe(config);
    vi.stubEnv("NUDGE_UI", "0");
    expect(withNudgeUi(config)).toBe(config);
  });

  it("routes transforms through Nudge UI and remembers the project's transformer", () => {
    const wrapped = withNudgeUi(expoConfig(), { typeAwareComponents: false });

    expect(wrapped.transformer?.babelTransformerPath).toBe(join(PACKAGE_ROOT, "dist", "hosts", "expo", "babel-transformer.cjs"));
    expect(process.env[EXPO_UPSTREAM_TRANSFORMER_ENV]).toBe("/expo/metro-config/babel-transformer.js");
    expect(readExpoTransformSettings()).toMatchObject({
      root,
      packageRoot: PACKAGE_ROOT,
      primitiveModules: ["react-native", "react-native-web"],
    });
  });

  it("adds the bootstrap polyfill to web bundles only", () => {
    const wrapped = withNudgeUi(expoConfig(), { typeAwareComponents: false });
    const getPolyfills = wrapped.serializer!.getPolyfills!;

    expect(getPolyfills({ platform: "web" })).toEqual(["/polyfills/js.js", join(root, ".nudge", "expo", "bootstrap.js")]);
    expect(getPolyfills({ platform: "ios" })).toEqual(["/polyfills/js.js"]);
    expect(getPolyfills({ platform: null })).toEqual([]);
  });

  it("resolves React for Nudge UI's runtime from the application", () => {
    const wrapped = withNudgeUi(expoConfig(), { typeAwareComponents: false });
    const resolveRequest = vi.fn((context: { originModulePath: string }) => ({ type: "sourceFile", filePath: context.originModulePath }));
    const resolve = wrapped.resolver!.resolveRequest!;
    const context = (originModulePath: string) => ({ originModulePath, resolveRequest });

    expect(resolve(context(join(PACKAGE_ROOT, "dist", "runtime.js")), "react", "web")).toMatchObject({ filePath: join(root, "package.json") });
    expect(resolve(context(join(PACKAGE_ROOT, "dist", "runtime.js")), "react/jsx-runtime", "web")).toMatchObject({ filePath: join(root, "package.json") });
    expect(resolve(context(join(PACKAGE_ROOT, "dist", "runtime.js")), "magic-string", "web")).toMatchObject({ filePath: join(PACKAGE_ROOT, "dist", "runtime.js") });
    expect(resolve(context(join(root, "App.tsx")), "react", "web")).toMatchObject({ filePath: join(root, "App.tsx") });
  });

  it("watches Nudge UI when it is linked from outside the project", () => {
    const wrapped = withNudgeUi(expoConfig(), { typeAwareComponents: false });
    expect(wrapped.watchFolders).toContain(PACKAGE_ROOT);
  });

  it("serves reserved routes ahead of Metro and passes everything else through", async () => {
    const seen: string[] = [];
    const wrapped = withNudgeUi(expoConfig({
      server: {
        enhanceMiddleware: (middleware) => (request, response, next) => {
          seen.push(request.url ?? "");
          middleware(request, response, next);
        },
      },
    }), { typeAwareComponents: false });
    const middleware = wrapped.server!.enhanceMiddleware!((_request, response) => {
      response.statusCode = 200;
      response.end("metro");
    }, {});
    const origin = await listen((request, response) => middleware(request, response, () => response.writeHead(404).end()));

    const manifest = await (await fetch(`${origin}/__nudge_ui__/manifest`)).json() as {
      runtime: { host: string; framework: string; componentContracts: Array<{ name: string }> };
    };
    expect(manifest.runtime.host).toBe("expo");
    expect(manifest.runtime.framework).toBe("React Native");
    expect(manifest.runtime.componentContracts.map((contract) => contract.name)).toContain("RideCard");

    const editor = await fetch(`${origin}/rides?nudge-ui=editor`, { headers: { accept: "text/html" } });
    expect(await editor.text()).toContain("data-nudge-ui-editor");

    expect(await (await fetch(`${origin}/index.bundle?platform=web`)).text()).toBe("metro");
    expect(seen).toEqual(["/index.bundle?platform=web"]);
  });
});
