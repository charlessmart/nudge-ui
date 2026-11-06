import { describe, expect, it } from "vitest";
import { extractComponentCatalog, extractComponentContracts } from "./componentContracts.ts";

describe("extractComponentContracts", () => {
  it("extracts enum and boolean controls from an inline props annotation", () => {
    const code = `
      export function Button({
        variant,
        size,
        disabled,
      }: {
        variant?: "primary" | "secondary";
        size: "small" | "medium" | "large";
        disabled?: boolean;
        label: string;
        onClick(): void;
      }) { return <button />; }
    `;

    expect(extractComponentContracts(code, "src/ui/Button.tsx")).toEqual([{
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [
        { name: "variant", control: "select", options: ["primary", "secondary"], optional: true },
        { name: "size", control: "select", options: ["small", "medium", "large"], optional: false },
        { name: "disabled", control: "boolean", options: [false, true], optional: true },
        { name: "label", control: "text", options: [], optional: false },
      ],
    }]);
  });

  it("resolves local interfaces, aliases, and React.FC annotations", () => {
    const code = `
      interface VisualProps { tone: "neutral" | "danger"; quiet?: boolean }
      type ButtonProps = VisualProps & { size?: "sm" | "lg" };
      export const Button: React.FC<ButtonProps> = ({ tone }) => <button>{tone}</button>;
    `;

    expect(extractComponentContracts(code, "src/ui/Button.tsx")[0]?.props).toEqual([
      { name: "tone", control: "select", options: ["neutral", "danger"], optional: false },
      { name: "quiet", control: "boolean", options: [false, true], optional: true },
      { name: "size", control: "select", options: ["sm", "lg"], optional: true },
    ]);
  });

  it("extracts local props from forwardRef and memo wrappers", () => {
    const code = `
      interface ButtonProps {
        variant?: "primary" | "secondary";
        disabled?: boolean;
      }
      export const Button = React.memo(React.forwardRef<HTMLButtonElement, ButtonProps>(
        ({ variant, disabled }, ref) => <button ref={ref} disabled={disabled}>{variant}</button>,
      ));
    `;

    expect(extractComponentContracts(code, "src/ui/Button.tsx")[0]).toEqual({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [
        { name: "variant", control: "select", options: ["primary", "secondary"], optional: true },
        { name: "disabled", control: "boolean", options: [false, true], optional: true },
      ],
    });
  });

  it("extracts literal defaults from destructured props of functions, arrows and wrappers", () => {
    const code = `
      interface ButtonProps {
        variant?: "primary" | "secondary";
        size?: "sm" | "md";
        loading?: boolean;
        label?: string;
      }
      export function Button({ variant = "primary", size = "huge", loading = false, label = "Go", ...props }: ButtonProps) {
        return <button {...props}>{label}</button>;
      }
      export const Chip = ({ variant = "secondary", loading = true }: ButtonProps) => <i />;
      export const Tag = React.forwardRef<HTMLSpanElement, ButtonProps>(
        ({ size = "sm" }, ref) => <span ref={ref} />,
      );
    `;
    const [button, chip, tag] = extractComponentContracts(code, "src/ui/Button.tsx");
    const defaults = (contract: typeof button) =>
      Object.fromEntries(contract!.props.map((prop) => [prop.name, prop.defaultValue]));
    // "huge" is not an option, so size gets no default.
    expect(defaults(button)).toEqual({ variant: "primary", size: undefined, loading: false, label: "Go" });
    expect(defaults(chip)).toEqual({ variant: "secondary", size: undefined, loading: true, label: undefined });
    expect(defaults(tag)).toEqual({ variant: undefined, size: "sm", loading: undefined, label: undefined });
  });

  it("ignores unconstrained and complex props", () => {
    const code = `
      type CardProps = { title: string; count: number; data: object; mode: "only" };
      export function Card(props: CardProps) { return <article />; }
    `;
    expect(extractComponentContracts(code, "src/ui/Card.tsx")).toEqual([{
      componentId: "src/ui/Card#Card",
      name: "Card",
      file: "src/ui/Card.tsx",
      provenance: "typescript",
      props: [{ name: "title", control: "text", options: [], optional: false }],
    }]);
  });

  it("extracts visible string props and ReactNode children, but not implementation strings", () => {
    const code = `
      import type { ReactNode } from "react";
      interface BadgeProps {
        children: ReactNode;
        label?: string;
        headline?: string;
        href?: string;
        ariaLabel?: string;
      }
      export function Badge(props: BadgeProps) { return <span>{props.children}</span>; }
    `;
    expect(extractComponentContracts(code, "src/ui/Badge.tsx")[0]?.props).toEqual([
      { name: "children", control: "text", options: [], optional: false },
      { name: "label", control: "text", options: [], optional: true },
      { name: "headline", control: "text", options: [], optional: true },
    ]);
  });

  it("derives select props from a cva call referenced by VariantProps", () => {
    const code = `
      const buttonVariants = cva("base", {
        variants: {
          variant: { default: "a", destructive: "b" },
          size: { default: "c", sm: "d" },
          loading: { true: "e", false: "f" },
        },
        defaultVariants: { variant: "default", size: "sm" },
      });
      function Button({ className, variant = "destructive", asChild = false, ...props }:
        React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
        return <button {...props} />;
      }
    `;
    expect(extractComponentContracts(code, "ui/button.tsx")[0]?.props).toEqual([
      { name: "asChild", control: "boolean", options: [false, true], optional: true, defaultValue: false },
      { name: "variant", control: "select", options: ["default", "destructive"], optional: true, defaultValue: "destructive" },
      { name: "size", control: "select", options: ["default", "sm"], optional: true, defaultValue: "sm" },
      { name: "loading", control: "boolean", options: [false, true], optional: true },
      { name: "children", control: "text", options: [], optional: true },
    ]);
  });

  it("supports tv() and interface or alias props types", () => {
    const code = `
      export const badge = tv({ base: "x", variants: { tone: { info: "a", warn: "b" } }, defaultVariants: { tone: "info" } });
      interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}
      export const Badge = ({ tone }: BadgeProps) => <span />;
      type ChipProps = VariantProps<typeof badge>;
      export function Chip(props: ChipProps) { return <span {...props} />; }
    `;
    const [badge, chip] = extractComponentContracts(code, "ui/badge.tsx");
    const tone = { name: "tone", control: "select", options: ["info", "warn"], optional: true, defaultValue: "info" };
    expect(badge?.props).toEqual([tone, { name: "children", control: "text", options: [], optional: true }]);
    expect(chip?.props).toEqual([tone, { name: "children", control: "text", options: [], optional: true }]);
  });

  it("does not add children for void elements", () => {
    const code = `
      const v = cva("x", { variants: { size: { sm: "a", lg: "b" } } });
      function Input(props: React.ComponentProps<"input"> & VariantProps<typeof v>) { return <input {...props} />; }
      function Field(props: React.InputHTMLAttributes<HTMLInputElement> & VariantProps<typeof v>) { return <input {...props} />; }
      function Area(props: React.ComponentProps<"textarea"> & VariantProps<typeof v>) { return <textarea {...props} />; }
    `;
    const contracts = extractComponentContracts(code, "ui/input.tsx");
    expect(contracts.map((contract) => contract.props.map((prop) => prop.name))).toEqual([["size"], ["size"], ["size"]]);
  });

  it("keeps an explicit children prop and drops contracts with no props", () => {
    const code = `
      const v = cva("x", { variants: { size: { sm: "a" } } });
      function A({ children }: { children: React.ReactNode } & React.ComponentProps<"div">) { return <div>{children}</div>; }
      function B(props: React.ComponentProps<"div">) { return <div {...props} />; }
      function C(props: { open: boolean }) { return <input />; }
    `;
    const [a, b, c] = extractComponentContracts(code, "ui/x.tsx");
    expect(a?.props).toEqual([{ name: "children", control: "text", options: [], optional: false }]);
    expect(b?.props.map((prop) => prop.name)).toEqual(["children"]);
    expect(c?.props.map((prop) => prop.name)).toEqual(["open"]);
  });

  it("returns an empty catalog for invalid source", () => {
    expect(extractComponentContracts("not valid {{{", "src/Broken.tsx")).toEqual([]);
  });
});

describe("component roles", () => {
  const code = `
    import { createContext, Suspense } from "react";
    export const Theme = createContext("light");
    export function ThemeProvider({ theme, children }: { theme: "light" | "dark"; children?: React.ReactNode }) {
      return <Theme.Provider value={theme}><Suspense fallback={null}>{children}</Suspense></Theme.Provider>;
    }
    export const Guard = ({ allowed, children }: { allowed: boolean; children?: React.ReactNode }) => allowed ? children : null;
    export function Card({ tone, children }: { tone?: "calm" | "loud"; children?: React.ReactNode }) {
      return <Box tone={tone}><Theme.Provider value="dark">{children}</Theme.Provider></Box>;
    }
    export function Row({ items }: { items: string[]; dense?: boolean }) { return <>{items.map((item) => <li key={item}>{item}</li>)}</>; }
    export function AudioProvider({ children }: { children?: React.ReactNode }) {
      return <Ctx.Provider value={1}>{children}<audio hidden /></Ctx.Provider>;
    }
    export function AppShell(props: PropsWithChildren) { return <QueryProvider><ThemeContext value="x">{props.children}</ThemeContext></QueryProvider>; }
  `;

  it("marks components that render only providers, boundaries or children as wrappers", () => {
    const roles = Object.fromEntries(extractComponentCatalog(code, "src/App.tsx").contracts
      .map((contract) => [contract.name, contract.role ?? "ui"]));
    expect(roles).toEqual({ ThemeProvider: "wrapper", Guard: "wrapper", Card: "ui", Row: "ui", AudioProvider: "wrapper" });
  });

  it("reports wrappers whose props only the type checker can read", () => {
    expect(extractComponentCatalog(code, "src/App.tsx").wrapperIds)
      .toEqual(["src/App#Theme", "src/App#ThemeProvider", "src/App#Guard", "src/App#AudioProvider", "src/App#AppShell"]);
  });
});
