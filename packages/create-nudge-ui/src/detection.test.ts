import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  adapterPackage,
  detectFrameworks,
  detectPackageManager,
  detectStaticRoot,
  readProjectManifest,
} from "./detection.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("detectFrameworks", () => {
  it("selects Astro instead of its underlying Vite and React dependencies", () => {
    const root = project({ dependencies: { astro: "^7", react: "^19", vite: "^7" } });
    expect(detectFrameworks(root)).toEqual(["astro"]);
  });

  it("selects Next.js instead of generic React", () => {
    const root = project({ dependencies: { next: "^16", react: "^19" } });
    expect(detectFrameworks(root)).toEqual(["nextjs"]);
  });

  it("detects Vite with React and static HTML projects", () => {
    const viteRoot = project({ devDependencies: { "@vitejs/plugin-react": "latest", vite: "latest" } });
    const htmlRoot = project({});
    writeFileSync(join(htmlRoot, "index.html"), "<!doctype html>");
    expect(detectFrameworks(viteRoot)).toEqual(["vite-react"]);
    expect(detectFrameworks(htmlRoot)).toEqual(["standalone"]);
  });

  it("detects a static document root one directory below the project root", () => {
    const root = project({});
    const prototype = join(root, "prototype");
    mkdirSync(prototype);
    writeFileSync(join(prototype, "index.html"), "<!doctype html>");
    expect(detectFrameworks(root)).toEqual(["standalone"]);
    expect(detectStaticRoot(root)).toBe(prototype);
  });

  it("returns competing host frameworks for explicit resolution", () => {
    const root = project({ dependencies: { astro: "^7", next: "^16" } });
    expect(detectFrameworks(root)).toEqual(["nextjs", "astro"]);
  });

  it("does not treat a non-React Vite project as static HTML", () => {
    const root = project({ devDependencies: { vite: "latest" } });
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    expect(detectFrameworks(root)).toEqual([]);
  });

  it("detects frameworks declared as optional dependencies", () => {
    const root = project({ optionalDependencies: { astro: "^7" } });
    expect(detectFrameworks(root)).toEqual(["astro"]);
  });
});

describe("readProjectManifest", () => {
  it("includes the manifest path when JSON is malformed", () => {
    const root = mkdtempSync(join(tmpdir(), "create-nudge-ui-"));
    temporaryDirectories.push(root);
    const manifestPath = join(root, "package.json");
    writeFileSync(manifestPath, "{");
    expect(() => readProjectManifest(root)).toThrow(`Could not parse ${manifestPath}`);
  });
});

describe("detectPackageManager", () => {
  it("prefers the packageManager declaration over lockfiles", () => {
    const root = project({ packageManager: "yarn@4.1.0" });
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(root)).toBe("yarn");
  });

  it("detects lockfiles and otherwise defaults to npm", () => {
    const pnpmRoot = project({});
    const npmRoot = project({});
    writeFileSync(join(pnpmRoot, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(pnpmRoot)).toBe("pnpm");
    expect(detectPackageManager(npmRoot)).toBe("npm");
  });

  it("uses a package manager lockfile from an enclosing workspace", () => {
    const root = project({});
    const child = join(root, "packages", "app");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, "package.json"), "{}");
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(child)).toBe("pnpm");
  });
});

describe("adapterPackage", () => {
  it("maps each host framework to its public adapter", () => {
    expect(adapterPackage("nextjs")).toBe("@nudge-ui/nextjs");
    expect(adapterPackage("astro")).toBe("@nudge-ui/astro");
    expect(adapterPackage("vite-react")).toBe("@nudge-ui/vite-react");
    expect(adapterPackage("standalone")).toBe("@nudge-ui/standalone");
  });
});

interface TestManifest {
  readonly packageManager?: string;
  readonly dependencies?: object;
  readonly devDependencies?: object;
  readonly optionalDependencies?: object;
}

function project(manifest: TestManifest): string {
  const root = mkdtempSync(join(tmpdir(), "create-nudge-ui-"));
  temporaryDirectories.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  expect(readProjectManifest(root)).toBeDefined();
  return root;
}
