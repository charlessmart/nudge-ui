import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentContract } from "../../compiler/index.ts";
import { nudgeUi } from "../vite/index.ts";
import {
  createTypeAwareContracts,
  selectTypeAwareRoots,
  type ContractRunner,
} from "./typeAwareContracts.ts";

const require = createRequire(import.meta.url);

interface TestPlugin {
  configResolved(config: { root: string; command: "serve" }): void;
  buildStart(): void;
  load(id: string): string | null | Promise<string | null>;
}

function write(root: string, path: string, content: string): string {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

const contract = (id: string, size: string): ComponentContract => ({
  componentId: id,
  name: id.split("#")[1]!,
  file: "src/A.tsx",
  props: [{ name: "size", control: "select", options: [size, "z"], optional: true }],
  provenance: "typescript",
});

describe("createTypeAwareContracts", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces edits into one pass and reports only changed results", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => [contract("src/A#A", "a")]);
    const onChange = vi.fn();
    const controller = createTypeAwareContracts({
      root: () => "/project",
      files: () => ["/project/src/A.tsx"],
      catalogPath: (file) => file.replace("/project/", ""),
      onChange,
      warn: () => undefined,
      createRunner: () => ({ run, dispose: () => undefined }),
    });
    controller.schedule();
    controller.schedule();
    await vi.advanceTimersByTimeAsync(299);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      root: "/project",
      files: ["/project/src/A.tsx"],
      catalogPaths: { "/project/src/A.tsx": "src/A.tsx" },
    }));
    expect(onChange).toHaveBeenCalledTimes(1);
    controller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("logs once and stops running after a failure", async () => {
    const warn = vi.fn();
    const runner: ContractRunner = {
      run: vi.fn(async () => { throw new Error("boom\nstack"); }),
      dispose: () => undefined,
    };
    const controller = createTypeAwareContracts({
      root: () => "/project",
      files: () => [],
      catalogPath: (file) => file,
      onChange: () => undefined,
      warn,
      createRunner: () => runner,
    });
    controller.refresh();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    controller.refresh();
    controller.schedule();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("boom");
  });
});

describe("nudgeUi type-aware project contracts", () => {
  it("publishes imported-props components computed by the worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-type-aware-"));
    try {
      mkdirSync(join(root, "node_modules", "@types"), { recursive: true });
      for (const name of ["react", "react-dom"]) {
        symlinkSync(dirname(require.resolve(`@types/${name}/package.json`)), join(root, "node_modules", "@types", name), "dir");
      }
      write(root, "tsconfig.json", JSON.stringify({
        compilerOptions: { jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", strict: true },
        include: ["src"],
      }));
      write(root, "src/types.ts", 'export type Tone = "calm" | "loud";\n');
      write(root, "src/Card.tsx", `
        import type { Tone } from "./types";
        export function Card({ tone = "calm" }: { tone?: Tone }) { return <p>{tone}</p>; }
        export function Local({ open = false }: { open?: boolean }) { return <p>{String(open)}</p>; }
      `);
      const [rawPlugin] = nudgeUi();
      const plugin = rawPlugin as unknown as TestPlugin;
      plugin.configResolved({ root, command: "serve" });
      plugin.buildStart();

      const catalog = async (): Promise<ComponentContract[]> => {
        const source = (await plugin.load("\0virtual:nudge-ui-components"))!;
        return JSON.parse(/^export const componentContracts = (.*);$/m.exec(source)![1]!) as ComponentContract[];
      };
      const findCard = async (): Promise<ComponentContract | undefined> =>
        (await catalog()).find((entry) => entry.componentId === "src/Card#Card");

      expect(await findCard()).toBeUndefined();
      await vi.waitFor(async () => {
        expect((await findCard())?.props).toContainEqual({
          name: "tone",
          control: "select",
          options: ["calm", "loud"],
          defaultValue: "calm",
          optional: true,
        });
      }, { timeout: 15_000 });
      // Syntactic output stays authoritative for what only it can see.
      expect((await catalog()).find((entry) => entry.componentId === "src/Card#Local")?.props[0])
        .toMatchObject({ name: "open", defaultValue: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("selectTypeAwareRoots", () => {
  it("drops tests, stories and fixtures", () => {
    expect(selectTypeAwareRoots([
      "/p/src/Button.tsx",
      "/p/src/Button.test.tsx",
      "/p/src/Button.stories.tsx",
      "/p/fixtures/a/Page.tsx",
      "/p/src/__tests__/x.tsx",
    ], "/p").roots).toEqual(["/p/src/Button.tsx"]);
  });

  it("judges paths relative to the project root", () => {
    expect(selectTypeAwareRoots(["/home/fixtures/app/src/A.tsx"], "/home/fixtures/app").roots)
      .toEqual(["/home/fixtures/app/src/A.tsx"]);
  });

  it("keeps the shallowest files past the limit", () => {
    const selected = selectTypeAwareRoots(["/p/a/b/c/D.tsx", "/p/E.tsx", "/p/a/F.tsx"], "/p", 2);
    expect(selected).toEqual({ roots: ["/p/E.tsx", "/p/a/F.tsx"], truncated: true });
  });
});
