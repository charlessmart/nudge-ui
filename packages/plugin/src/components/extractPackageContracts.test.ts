import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  collectPackageComponentModules,
  extractPackageComponentContracts,
} from "./extractPackageContracts.ts";

function writeFixtureFile(root: string, path: string, content: string): string {
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
  return file;
}

describe("extractPackageComponentContracts", () => {
  it("collects only bare imports rendered as JSX components", () => {
    expect(collectPackageComponentModules(`
      import type { ButtonProps } from "@fixture/design-system/components";
      import { Button, buttonVariants } from "@fixture/design-system/components";
      import * as Layout from "@fixture/layout";
      import { LocalCard } from "./LocalCard";
      const value = buttonVariants[0];
      export const App = () => <><Button variant={value} /><Layout.Stack /><LocalCard /></>;
    `, "src/App.tsx")).toEqual([
      "@fixture/design-system/components",
      "@fixture/layout",
    ]);
  });

  it("follows a barrel into a ForwardRefExoticComponent declaration and resolves a tuple alias", () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-package-contracts-"));
    try {
      const hostFile = writeFixtureFile(
        root,
        "src/App.tsx",
        `
          import { Button } from "@envato/design-system/components";
          export const App = () => <Button variant="primary">Save</Button>;
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/package.json",
        JSON.stringify({
          name: "@envato/design-system",
          exports: {
            "./components": {
              types: "./dist/types/components/index.d.ts",
              import: "./dist/esm/components/index.js",
            },
          },
        }),
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/esm/components/index.js",
        "export { Button } from './Button/Button.js';",
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/index.d.ts",
        `
          export { Button, type ButtonProps } from "./Button/Button.js";
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/Button/Button.d.ts",
        `
          import type {
            ForwardRefExoticComponent,
            PropsWithChildren,
            RefAttributes,
          } from "react";
          import type { Variant } from "./props/Variant.js";

          interface Props {
            active?: boolean;
            variant?: Variant;
            responsiveVariant?: Variant | { default: Variant };
            ref?: unknown;
          }

          export type ButtonProps = PropsWithChildren<Omit<Props, "ref">>;
          export declare const Button: ForwardRefExoticComponent<
            ButtonProps & RefAttributes<HTMLButtonElement>
          >;
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/Button/props/Variant.d.ts",
        `
          export declare const buttonVariants: readonly [
            "critical",
            "elevated",
            "neutral",
            "overlay",
            "primary",
            "secondary",
            "tertiary",
          ];
          export type Variant = (typeof buttonVariants)[number];
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/react/package.json",
        JSON.stringify({ name: "react", types: "index.d.ts" }),
      );
      writeFixtureFile(
        root,
        "node_modules/react/index.d.ts",
        `
          export type ReactNode = unknown;
          export type PropsWithChildren<P> = P & { children?: ReactNode };
          export interface RefAttributes<T> { ref?: unknown; }
          export interface ForwardRefExoticComponent<P> {
            (props: P): unknown;
          }
          declare global {
            namespace JSX {
              interface Element {}
              interface IntrinsicElements { [name: string]: unknown; }
            }
          }
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/react/jsx-runtime.d.ts",
        `
          export function jsx(type: unknown, props: unknown): unknown;
          export function jsxs(type: unknown, props: unknown): unknown;
          export const Fragment: unknown;
        `,
      );

      expect(extractPackageComponentContracts({
        hostFile,
        moduleSpecifier: "@envato/design-system/components",
      })).toEqual([{
        componentId: "@envato/design-system/components#Button",
        name: "Button",
        file: "@envato/design-system/components",
        provenance: "typescript",
        props: [
          {
            name: "active",
            control: "boolean",
            options: [false, true],
            optional: true,
          },
          {
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
          },
        ],
      }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no contracts when the import cannot be resolved from the host", () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-package-contracts-"));
    try {
      const hostFile = writeFixtureFile(root, "src/App.tsx", "export const App = null;");
      expect(extractPackageComponentContracts({
        hostFile,
        moduleSpecifier: "@envato/missing/components",
      })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
