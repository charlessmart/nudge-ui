import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createStandaloneTokenSnapshot,
  discoverStandaloneCssArtifacts,
} from "./tokenManifest.ts";

describe("standalone CSS token discovery", () => {
  it("scans stable project-relative paths and excludes generated directories and escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "design-tool-token-manifest-"));
    const outside = await mkdtemp(join(tmpdir(), "design-tool-token-outside-"));
    await writeFile(join(root, "z.css"), ":root { --z: 1px; }");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "a.css"), ":root { --a: 2px; }");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "generated.css"), ":root { --generated: 3px; }");
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "package.css"), ":root { --package: 4px; }");
    await writeFile(join(outside, "secret.css"), ":root { --secret: 5px; }");
    await symlink(join(outside, "secret.css"), join(root, "outside.css"));

    const artifacts = discoverStandaloneCssArtifacts(root);
    expect(artifacts.map((artifact) => artifact.projectPath)).toEqual([
      "nested/a.css",
      "z.css",
    ]);
    expect(artifacts.map((artifact) => artifact.absolutePath)).not.toContain(
      join(outside, "secret.css"),
    );
  });

  it("publishes authored provenance and a deterministic generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "design-tool-token-manifest-"));
    await mkdir(join(root, "styles"));
    await writeFile(join(root, "styles", "theme.css"), ":root { --brand: #09f; }");

    const first = createStandaloneTokenSnapshot({ rootDirectory: root });
    const second = createStandaloneTokenSnapshot({ rootDirectory: root });
    expect(second).toEqual(first);
    expect(first.tokens).toEqual([expect.objectContaining({
      cssName: "--brand",
      source: "styles/theme.css:1",
      origin: "project",
    })]);
    expect(first.tokenCatalog[0]?.declarations[0]?.source).toBe("styles/theme.css:1");
  });

  it("retains valid knowledge and reports malformed and unreadable CSS", async () => {
    const root = await mkdtemp(join(tmpdir(), "design-tool-token-manifest-"));
    await writeFile(join(root, "valid.css"), ":root { --valid: 1px; }");
    await writeFile(join(root, "broken.css"), ":root { --broken: ;");
    await writeFile(join(root, "unreadable.css"), ":root { --unreadable: 1px; }");

    const snapshot = createStandaloneTokenSnapshot({
      rootDirectory: root,
      readFile: (absolutePath) => {
        if (absolutePath.endsWith("unreadable.css")) {
          const error = new Error("permission denied") as Error & { code: string };
          error.code = "EACCES";
          throw error;
        }
        return requireReadFile(absolutePath);
      },
    });

    expect(snapshot.tokens).toEqual([expect.objectContaining({ cssName: "--valid" })]);
    expect(snapshot.tokenDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "stylesheet-parse-failed",
        module: "broken.css",
      }),
      expect.objectContaining({
        code: "stylesheet-unreadable",
        module: "unreadable.css",
      }),
    ]));
  });

  it("changes generation for CSS add, change, and remove transitions", async () => {
    const root = await mkdtemp(join(tmpdir(), "design-tool-token-manifest-"));
    await writeFile(join(root, "base.css"), ":root { --base: 1px; }");
    const initial = createStandaloneTokenSnapshot({ rootDirectory: root });

    await writeFile(join(root, "added.css"), ":root { --added: 2px; }");
    const added = createStandaloneTokenSnapshot({ rootDirectory: root });
    expect(added.tokenGeneration).not.toBe(initial.tokenGeneration);

    await writeFile(join(root, "added.css"), ":root { --added: 3px; }");
    const changed = createStandaloneTokenSnapshot({ rootDirectory: root });
    expect(changed.tokenGeneration).not.toBe(added.tokenGeneration);

    const { unlink } = await import("node:fs/promises");
    await unlink(join(root, "added.css"));
    const removed = createStandaloneTokenSnapshot({ rootDirectory: root });
    expect(removed.tokenGeneration).toBe(initial.tokenGeneration);
  });
});

function requireReadFile(path: string): string {
  return readFileSync(path, "utf8");
}
