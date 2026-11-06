import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ComponentContract } from "./componentContractTypes.ts";
import { extractComponentContracts } from "./componentContracts.ts";
import {
  extractProjectComponentContracts,
  mergeComponentContract,
  mergeComponentContracts,
} from "./projectComponentContracts.ts";

const require = createRequire(import.meta.url);

function write(root: string, path: string, content: string): string {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function linkTypes(root: string): void {
  mkdirSync(join(root, "node_modules", "@types"), { recursive: true });
  for (const name of ["react", "react-dom"]) {
    const entry = require.resolve(`@types/${name}/package.json`);
    symlinkSync(dirname(entry), join(root, "node_modules", "@types", name), "dir");
  }
}

const FILES = {
  "src/ds/types.ts": `
    export type Size = "sm" | "md" | "lg";
    export enum Intent { Info = "info", Warn = "warn" }
    export interface CardProps { size?: Size; title: string; elevated?: boolean }
  `,
  "src/ds/Card.tsx": `
    import type { CardProps } from "./types";
    export function Card({ size = "md", title }: CardProps) {
      return <section data-size={size}>{title}</section>;
    }
  `,
  "src/ds/Alert.tsx": `
    import { Intent } from "@/ds/types";
    export interface AlertProps { intent: Intent; dismissible?: boolean }
    export const Alert = ({ intent }: AlertProps) => <div role="alert">{intent}</div>;
  `,
  "src/ds/Wrapped.tsx": `
    import type { ComponentProps } from "react";
    import { DsButton } from "@fixture/ds";
    export const Wrapped = (props: ComponentProps<typeof DsButton>) => <DsButton {...props} />;
  `,
  "src/ds/Panel.tsx": `
    import type { PropsWithChildren } from "react";
    export function Panel(props: PropsWithChildren<{ dense?: boolean }>) {
      return <div>{props.children}</div>;
    }
  `,
  "src/ds/Field.tsx": `
    import { forwardRef, memo, type ComponentProps } from "react";
    type FieldProps = { tone?: "calm" | "loud" } & ComponentProps<"input">;
    export const Field = memo(forwardRef<HTMLInputElement, FieldProps>(function Field({ tone, ...rest }, ref) {
      return <input ref={ref} data-tone={tone} {...rest} />;
    }));
  `,
  "src/ds/Badge.tsx": `
    import { forwardRef, memo, type ComponentProps, type ReactNode } from "react";
    type BadgeProps = { kind?: "info" | "danger"; label?: ReactNode } & ComponentProps<"span">;
    export const Badge = memo(forwardRef<HTMLSpanElement, BadgeProps>(function Badge({ kind, ...rest }, ref) {
      return <span ref={ref} data-kind={kind} {...rest} />;
    }));
  `,
  "src/ds/helpers.ts": "export function Helper(props: { x: boolean }) { return props; }",
};

describe("extractProjectComponentContracts", () => {
  let root: string;
  let contracts: ComponentContract[];
  const byId = (id: string): ComponentContract | undefined =>
    contracts.find((contract) => contract.componentId === id);
  const names = (id: string): string[] => byId(id)?.props.map((prop) => prop.name).sort() ?? [];

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "nudge-ui-project-contracts-"));
    linkTypes(root);
    write(root, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        baseUrl: ".",
        paths: { "@/*": ["src/*"] },
      },
      include: ["src"],
    }));
    write(root, "node_modules/@fixture/ds/package.json", JSON.stringify({
      name: "@fixture/ds",
      types: "index.d.ts",
    }));
    write(root, "node_modules/@fixture/ds/index.d.ts", `
      import type { ComponentPropsWithoutRef, ForwardRefExoticComponent } from "react";
      export interface DsButtonProps extends ComponentPropsWithoutRef<"button"> {
        variant?: "primary" | "secondary" | "ghost";
        loading?: boolean;
      }
      export declare const DsButton: ForwardRefExoticComponent<DsButtonProps>;
    `);
    const files = Object.entries(FILES).map(([path, content]) => write(root, path, content));
    contracts = extractProjectComponentContracts({
      root,
      files: files.filter((file) => file.endsWith(".tsx")),
    }).contracts;
  }, 60_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads a props type imported from another file, with the syntactic id format", () => {
    const card = byId("src/ds/Card#Card");
    expect(card).toMatchObject({ name: "Card", file: "src/ds/Card.tsx", provenance: "typescript" });
    expect(card?.props).toContainEqual({
      name: "size",
      control: "select",
      options: ["sm", "md", "lg"],
      optional: true,
      defaultValue: "md",
    });
    expect(card?.props).toContainEqual({ name: "title", control: "text", options: [], optional: false });
    expect(card?.props).toContainEqual({ name: "elevated", control: "boolean", options: [false, true], optional: true });

    const syntactic = extractComponentContracts(FILES["src/ds/Card.tsx"], "src/ds/Card.tsx");
    expect(syntactic).toEqual([]);
    const local = extractComponentContracts(
      "export function Local(props: { size?: 'a' | 'b' }) { return null; }",
      "src/ds/Local.tsx",
    );
    expect(local[0]?.componentId).toBe("src/ds/Local#Local");
  });

  it("resolves enum props through a tsconfig paths alias", () => {
    expect(byId("src/ds/Alert#Alert")?.props).toContainEqual({
      name: "intent",
      control: "select",
      options: ["info", "warn"],
      optional: false,
    });
  });

  it("keeps design-system props from ComponentProps<typeof X> and drops DOM attributes", () => {
    const wrapped = byId("src/ds/Wrapped#Wrapped");
    expect(wrapped?.props).toContainEqual({
      name: "variant",
      control: "select",
      options: ["primary", "secondary", "ghost"],
      optional: true,
    });
    expect(names("src/ds/Wrapped#Wrapped")).toEqual(["children", "loading", "variant"]);
    for (const dom of ["onClick", "disabled", "type", "className", "title", "tabIndex", "ref"]) {
      expect(names("src/ds/Wrapped#Wrapped")).not.toContain(dom);
    }
  });

  it("adds optional text children for PropsWithChildren", () => {
    expect(byId("src/ds/Panel#Panel")?.props).toEqual([
      { name: "dense", control: "boolean", options: [false, true], optional: true },
      { name: "children", control: "text", options: [], optional: true },
    ]);
  });

  it("unwraps memo(forwardRef()) and applies the void-element rule to children", () => {
    expect(names("src/ds/Field#Field")).toEqual(["tone"]);
    expect(names("src/ds/Badge#Badge")).toEqual(["children", "kind", "label"]);
    expect(byId("src/ds/Badge#Badge")?.props.find((prop) => prop.name === "label")).toMatchObject({
      control: "text",
    });
  });

  it("only visits the root files it was given", () => {
    expect(byId("src/ds/helpers#Helper")).toBeUndefined();
  });

  it("rebuilds from an old program and sees an edited props type", () => {
    const files = [join(root, "src/ds/Card.tsx")];
    const first = extractProjectComponentContracts({ root, files });
    write(root, "src/ds/types.ts", FILES["src/ds/types.ts"].replace('"lg"', '"lg" | "xl"'));
    const second = extractProjectComponentContracts({ root, files, oldProgram: first.program });
    expect(second.contracts[0]?.props.find((prop) => prop.name === "size")?.options)
      .toEqual(["sm", "md", "lg", "xl"]);
  });
});

describe("solution-style tsconfig", () => {
  it("takes options from the referenced project that includes the components", () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-project-solution-"));
    try {
      linkTypes(root);
      write(root, "tsconfig.json", JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.node.json" }, { path: "./tsconfig.app.json" }],
      }));
      write(root, "tsconfig.node.json", JSON.stringify({
        compilerOptions: { composite: true, module: "esnext", moduleResolution: "bundler" },
        include: ["vite.config.ts"],
      }));
      write(root, "tsconfig.app.json", JSON.stringify({
        compilerOptions: {
          composite: true,
          jsx: "react-jsx",
          module: "esnext",
          moduleResolution: "bundler",
          strict: true,
          baseUrl: ".",
          paths: { "~/*": ["src/*"] },
        },
        include: ["src"],
      }));
      write(root, "vite.config.ts", "export default {};");
      write(root, "src/mode.ts", 'export type Mode = "a" | "b";');
      const file = write(root, "src/Toggle.tsx", `
        import type { Mode } from "~/mode";
        export const Toggle = (props: { mode: Mode }) => <i>{props.mode}</i>;
      `);
      expect(extractProjectComponentContracts({ root, files: [file] }).contracts[0]?.props)
        .toEqual([{ name: "mode", control: "select", options: ["a", "b"], optional: false }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("falls back to sensible defaults without any tsconfig", () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-project-notsconfig-"));
    try {
      linkTypes(root);
      const file = write(root, "src/Chip.tsx", "export const Chip = (props: { on?: boolean }) => <b />;");
      expect(extractProjectComponentContracts({ root, files: [file] }).contracts[0])
        .toMatchObject({ componentId: "src/Chip#Chip" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

const contract = (props: ComponentContract["props"], id = "src/A#A"): ComponentContract => ({
  componentId: id,
  name: "A",
  file: "src/A.tsx",
  props,
  provenance: "typescript",
});

describe("mergeComponentContracts", () => {
  it("lets checker controls win, keeps authored defaults, and unions prop names", () => {
    const syntactic = contract([
      { name: "size", control: "select", options: ["a", "b"], optional: true, defaultValue: "b" },
      { name: "legacy", control: "boolean", options: [false, true], optional: true, defaultValue: true },
    ]);
    const checked = contract([
      { name: "size", control: "select", options: ["a", "b", "c"], optional: true },
      { name: "extra", control: "text", options: [], optional: true },
    ]);
    expect(mergeComponentContract(syntactic, checked)?.props).toEqual([
      { name: "size", control: "select", options: ["a", "b", "c"], optional: true, defaultValue: "b" },
      { name: "legacy", control: "boolean", options: [false, true], optional: true, defaultValue: true },
      { name: "extra", control: "text", options: [], optional: true },
    ]);
  });

  it("drops a default the checker's options no longer allow", () => {
    const merged = mergeComponentContract(
      contract([{ name: "size", control: "select", options: ["a", "b"], optional: true, defaultValue: "b" }]),
      contract([{ name: "size", control: "select", options: ["a", "c"], optional: true }]),
    );
    expect(merged?.props[0]).not.toHaveProperty("defaultValue");
  });

  it("keeps syntactic-only contracts, adds checker-only ones, and skips manual ids", () => {
    const only = contract([{ name: "x", control: "boolean", options: [false, true], optional: true }], "src/B#B");
    const added = contract([{ name: "y", control: "boolean", options: [false, true], optional: true }], "src/C#C");
    const manual = contract([{ name: "z", control: "boolean", options: [false, true], optional: true }], "pkg#M");
    const merged = mergeComponentContracts(
      [only],
      new Map([[added.componentId, added], [manual.componentId, manual]]),
      new Set(["pkg#M"]),
    );
    expect(merged.map((entry) => entry.componentId)).toEqual(["src/B#B", "src/C#C"]);
  });
});
