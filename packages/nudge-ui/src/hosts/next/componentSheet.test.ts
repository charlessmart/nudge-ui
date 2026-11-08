import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ComponentContract } from "../../compiler/index.ts";
import { reactComponentFramework } from "../componentFramework/react.ts";
import {
  createSheetPageSource,
  nextSheetPaths,
  removeSheetRoute,
  serializeNextSheetDefinition,
  withSheetPageExtension,
  writeSheetRoute,
} from "./componentSheet.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "next-sheet-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const LAYOUT = "export default function RootLayout({ children }) {\n  return <html><body>{children}</body></html>;\n}\n";

function contract(file: string, name: string): ComponentContract {
  return { componentId: `${file.replace(/\.[^.]+$/, "")}#${name}`, name, file, props: [], provenance: "typescript" };
}

describe("nextSheetPaths", () => {
  it("places the stub route in the App Router directory and the definition under .nudge", () => {
    const root = project({ "src/app/layout.tsx": LAYOUT });
    const paths = nextSheetPaths(root)!;
    expect(paths.page).toBe(join(root, "src/app/%5F%5Fnudge_ui%5F%5F/components/page.nudge.tsx"));
    expect(paths.definition).toBe(join(root, ".nudge/next/component-sheet.ts"));
  });

  it("is null without a root layout, so Pages Router projects get no sheets", () => {
    expect(nextSheetPaths(project({ "pages/index.tsx": "export default () => null;\n" }))).toBeNull();
  });
});

describe("withSheetPageExtension", () => {
  it("appends the development-only extension to Next's defaults or the project's list", () => {
    expect(withSheetPageExtension(undefined)).toEqual(["tsx", "ts", "jsx", "js", "nudge.tsx"]);
    expect(withSheetPageExtension(["page.tsx", "mdx"])).toEqual(["page.tsx", "mdx", "nudge.tsx"]);
    expect(withSheetPageExtension(["tsx", "nudge.tsx"])).toEqual(["tsx", "nudge.tsx"]);
  });
});

describe("sheet route", () => {
  it("writes a stub that ignores itself in git and imports the generated definition", () => {
    const root = project({ "app/layout.tsx": LAYOUT });
    const paths = nextSheetPaths(root)!;
    writeSheetRoute(paths, reactComponentFramework);

    expect(readFileSync(join(paths.routeFolder, ".gitignore"), "utf8")).toBe("*\n");
    const page = readFileSync(paths.page, "utf8");
    expect(page).toBe(createSheetPageSource(paths));
    expect(page).toContain('"use client";');
    expect(page).toContain('from "../../../.nudge/next/component-sheet"');
    // The identity loader instruments JSX, so the stub has none.
    expect(page).not.toMatch(/<[A-Z]/);
    expect(readFileSync(paths.definition, "utf8")).toContain("export const componentSheet = {");
  });

  it("keeps an existing definition, which the sidecar owns", () => {
    const root = project({ "app/layout.tsx": LAYOUT, ".nudge/next/component-sheet.ts": "export const componentSheet = { kept: true };\n" });
    writeSheetRoute(nextSheetPaths(root)!, reactComponentFramework);
    expect(readFileSync(join(root, ".nudge/next/component-sheet.ts"), "utf8")).toContain("kept: true");
  });

  it("removes only a stub it wrote", () => {
    const root = project({ "app/layout.tsx": LAYOUT });
    const paths = nextSheetPaths(root)!;
    writeSheetRoute(paths, reactComponentFramework);
    removeSheetRoute(root);
    expect(existsSync(paths.routeFolder)).toBe(false);

    const authored = project({
      "app/layout.tsx": LAYOUT,
      "app/%5F%5Fnudge_ui%5F%5F/components/page.nudge.tsx": "export default function Mine() { return null; }\n",
    });
    removeSheetRoute(authored);
    expect(existsSync(join(authored, "app/%5F%5Fnudge_ui%5F%5F/components/page.nudge.tsx"))).toBe(true);
  });
});

describe("serializeNextSheetDefinition", () => {
  it("lists only modules a browser can load, because one bad import fails the whole compile", () => {
    const root = project({
      "app/layout.tsx": LAYOUT,
      "app/Button.tsx": "export function Button() { return <button />; }\n",
      "app/Account.tsx": 'import "server-only";\nexport function Account() { return <div />; }\n',
      "app/Shell.tsx": 'export const metadata = { title: "x" };\nexport function Shell() { return <div />; }\n',
      "node_modules/@ui/kit/package.json": "{}\n",
      "nudge.sheet.tsx": "export default function Wrap({ children }) { return children; }\n",
    });
    const source = serializeNextSheetDefinition({
      framework: reactComponentFramework,
      root,
      definition: join(root, ".nudge/next/component-sheet.ts"),
      contracts: [
        contract("app/Button.tsx", "Button"),
        contract("app/Account.tsx", "Account"),
        contract("app/Shell.tsx", "Shell"),
        contract("app/layout.tsx", "RootLayout"),
        contract("app/Gone.tsx", "Gone"),
        { ...contract("@ui/kit", "Chip"), componentId: "@ui/kit#Chip", provenance: "package-manifest" },
        { ...contract("@ui/missing", "Tag"), componentId: "@ui/missing#Tag", provenance: "package-manifest" },
      ],
    });
    expect(source.split("\n")[1]).toBe("// @ts-nocheck");
    expect(source).toContain('"app/Button#Button": () => import("../../app/Button.tsx")');
    expect(source).toContain('"@ui/kit#Chip": () => import("@ui/kit")');
    expect(source).not.toContain("Account");
    expect(source).not.toContain("Shell");
    expect(source).not.toContain("RootLayout");
    expect(source).not.toContain("Gone");
    expect(source).not.toContain("@ui/missing");
    expect(source).toContain('sheetWrapper: { file: "nudge.sheet.tsx", load: () => import("../../nudge.sheet.tsx")');
  });
});
