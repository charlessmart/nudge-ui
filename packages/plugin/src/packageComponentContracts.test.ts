import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nudgeUi } from "./index.ts";

interface TestPlugin {
  configResolved(config: { root: string; command: "serve" }): void;
  buildStart(): void;
  transform: {
    handler(code: string, id: string): Promise<{ code: string } | null>;
  };
  load(id: string): string | null | Promise<string | null>;
}

function componentCatalog(moduleSource: string): unknown[] {
  const match = /^export const componentContracts = (.*);$/m.exec(moduleSource);
  if (!match) throw new Error("virtual component module did not publish a catalog");
  return JSON.parse(match[1]!) as unknown[];
}

describe("npm package component contracts", () => {
  it("publishes a typed Button prop from a package declaration", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-npm-component-"));
    const packageRoot = join(root, "node_modules", "@fixture", "design-system");
    const appRoot = join(root, "src");
    mkdirSync(packageRoot, { recursive: true });
    mkdirSync(appRoot, { recursive: true });

    const appSource = `
      import { Button } from "@fixture/design-system/components";
      export function App() {
        return <Button variant="primary" />;
      }
    `;
    const declarationsRoot = join(packageRoot, "dist", "types", "components");
    mkdirSync(join(declarationsRoot, "Button", "props"), { recursive: true });
    mkdirSync(join(packageRoot, "dist", "esm", "components"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({
      name: "@fixture/design-system",
      exports: {
        "./components": {
          types: "./dist/types/components/index.d.ts",
          import: "./dist/esm/components/index.js",
        },
      },
    }));
    writeFileSync(
      join(packageRoot, "dist", "esm", "components", "index.js"),
      "export const Button = () => null;",
    );
    writeFileSync(
      join(declarationsRoot, "index.d.ts"),
      'export { Button, type ButtonProps } from "./Button/Button.js";',
    );
    writeFileSync(join(declarationsRoot, "Button", "Button.d.ts"), `
      import type { ForwardRefExoticComponent } from "react";
      import type { Variant } from "./props/Variant.js";
      export interface ButtonProps { variant?: Variant }
      export declare const Button: ForwardRefExoticComponent<ButtonProps>;
    `);
    writeFileSync(join(declarationsRoot, "Button", "props", "Variant.d.ts"), `
      export declare const variants: readonly [
        "critical",
        "elevated",
        "neutral",
        "overlay",
        "primary",
        "secondary",
        "tertiary",
      ];
      export type Variant = (typeof variants)[number];
    `);
    const reactRoot = join(root, "node_modules", "react");
    mkdirSync(reactRoot, { recursive: true });
    writeFileSync(join(reactRoot, "package.json"), JSON.stringify({
      name: "react",
      types: "index.d.ts",
    }));
    writeFileSync(join(reactRoot, "index.d.ts"), `
      export interface ForwardRefExoticComponent<Props> { (props: Props): unknown }
    `);
    writeFileSync(join(appRoot, "App.tsx"), appSource);

    try {
      const [rawPlugin] = nudgeUi({
        compatibleComponentImports: {
          "@fixture/design-system/components": ["Button"],
        },
      });
      const plugin = rawPlugin as unknown as TestPlugin;
      plugin.configResolved({ root, command: "serve" });
      plugin.buildStart();

      const appResult = await plugin.transform.handler.call({
        resolve: async () => null,
        warn: () => undefined,
      }, appSource, join(appRoot, "App.tsx"));
      expect(appResult?.code)
        .toContain('"componentId":"@fixture/design-system/components#Button"');
      expect(appResult?.code).toContain('"variant":"literal"');

      const virtual = await plugin.load("\0virtual:nudge-ui-components");
      const catalog = componentCatalog(virtual!);

      expect(catalog).toContainEqual(expect.objectContaining({
        componentId: "@fixture/design-system/components#Button",
        name: "Button",
        props: [{
          name: "variant",
          control: "select",
          options: [
            "critical",
            "elevated",
            "neutral",
            "overlay",
            "primary",
            "secondary",
            "tertiary",
          ],
          optional: true,
        }],
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves aliases and structural re-exports before instrumenting JSX", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-host-policy-"));
    const appRoot = join(root, "src");
    const structuralBarrel = join(appRoot, "structural.ts");
    const pageModule = join(appRoot, "Page.tsx");
    mkdirSync(appRoot, { recursive: true });
    writeFileSync(
      structuralBarrel,
      'export { Provider, Item } from "structural-library";\n',
    );
    writeFileSync(pageModule, "export function Page() { return <main />; }\n");

    const source = [
      'import { Provider, Item } from "@/structural";',
      'import { Page } from "@/Page";',
      "export const App = () => <Provider><Item content={<Page />} /></Provider>;",
    ].join("\n");
    const [rawPlugin] = nudgeUi({
      componentProtocols: {
        "structural-library": {
          default: { wrap: false },
          exports: {
            Provider: { wrap: false, slots: { children: "rendered" } },
            Item: { wrap: false, slots: { content: "rendered" } },
          },
        },
      },
    });
    const plugin = rawPlugin as unknown as TestPlugin;
    plugin.configResolved({ root, command: "serve" });
    const warnings: string[] = [];

    try {
      const result = await plugin.transform.handler.call({
        async resolve(specifier: string) {
          if (specifier === "@/structural") return { id: structuralBarrel };
          if (specifier === "@/Page") return { id: pageModule };
          if (specifier === "structural-library") {
            return { id: join(root, "node_modules", "structural-library", "index.js") };
          }
          return null;
        },
        warn(message: string) {
          warnings.push(message);
        },
      }, source, join(appRoot, "App.tsx"));

      expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Provider");
      expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Item");
      expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Page");
      expect(result?.code).toContain('"componentId":"src/Page#Page"');
      expect(warnings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
