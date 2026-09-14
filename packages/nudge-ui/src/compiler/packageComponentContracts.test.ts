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
} from "./packageComponentContracts.ts";

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
          {
            name: "responsiveVariant",
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

  it("publishes scalar options from conditional package prop declarations", () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-package-contracts-"));
    try {
      const hostFile = writeFixtureFile(
        root,
        "src/App.tsx",
        `
          import {
            Container,
            CustomButtonBase,
          } from "@envato/design-system/components";

          export const App = () => <>
            <Container size="medium" />
            <CustomButtonBase
              padding="medium"
              backgroundColor="accent"
            />
          </>;
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
        `
          export { Container } from "./Container/Container.js";
          export { CustomButtonBase } from "./CustomButtonBase/CustomButtonBase.js";
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/index.d.ts",
        `
          export { Container, type ContainerProps } from "./Container/Container.js";
          export {
            CustomButtonBase,
            type CustomButtonBaseProps,
          } from "./CustomButtonBase/CustomButtonBase.js";
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/Container/Container.d.ts",
        `
          import type { ForwardRefExoticComponent } from "react";

          export type ContainerSizeConditionalValue<T extends string> =
            | T
            | { default?: T; sm?: T; md?: T };

          export interface ContainerProps {
            label?: string;
            size?: ContainerSizeConditionalValue<"small" | "medium" | "large">;
            arbitrary?: ContainerSizeConditionalValue<string>;
            mixed?: "small" | "medium" | 0 | { default?: "small" };
            broadMixed?: "small" | "medium" | number | { default?: "small" };
            brandedMixed?:
              | "small"
              | "medium"
              | (string & { readonly __brand: "custom" })
              | { default?: "small" };
            unrelatedObject?:
              | "small"
              | "medium"
              | { kind: "custom" };
          }

          export declare const Container: ForwardRefExoticComponent<ContainerProps>;
        `,
      );
      writeFixtureFile(
        root,
        "node_modules/@envato/design-system/dist/types/components/CustomButtonBase/CustomButtonBase.d.ts",
        `
          import type { ForwardRefExoticComponent } from "react";

          type ConditionalValue<T> =
            | T
            | { default?: T; hover?: T };

          export interface CustomButtonBaseProps {
            variant?: "solid" | "outline";
            padding?: ConditionalValue<"small" | "medium" | "large">;
            backgroundColor?: ConditionalValue<"neutral" | "accent">;
            disabled?: ConditionalValue<boolean>;
            mixedDisabled?: boolean | string | { default?: boolean };
            unrelatedDisabledObject?: boolean | { default?: "yes" };
          }

          export declare const CustomButtonBase: ForwardRefExoticComponent<CustomButtonBaseProps>;
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
          export interface ForwardRefExoticComponent<Props> { (props: Props): unknown }
        `,
      );

      expect(extractPackageComponentContracts({
        hostFile,
        moduleSpecifier: "@envato/design-system/components",
      })).toEqual([
        {
          componentId: "@envato/design-system/components#Container",
          name: "Container",
          file: "@envato/design-system/components",
          provenance: "typescript",
          props: [
            {
              name: "label",
              control: "text",
              options: [],
              optional: true,
            },
            {
              name: "size",
              control: "select",
              options: ["small", "medium", "large"],
              optional: true,
            },
          ],
        },
        {
          componentId: "@envato/design-system/components#CustomButtonBase",
          name: "CustomButtonBase",
          file: "@envato/design-system/components",
          provenance: "typescript",
          props: [
            {
              name: "variant",
              control: "select",
              options: ["solid", "outline"],
              optional: true,
            },
            {
              name: "padding",
              control: "select",
              options: ["small", "medium", "large"],
              optional: true,
            },
            {
              name: "backgroundColor",
              control: "select",
              options: ["neutral", "accent"],
              optional: true,
            },
            {
              name: "disabled",
              control: "boolean",
              options: [false, true],
              optional: true,
            },
          ],
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
