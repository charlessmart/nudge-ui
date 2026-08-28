import { describe, expect, it } from "vitest";
import { extractComponentContracts } from "./extractContracts.ts";

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

  it("returns an empty catalog for invalid source", () => {
    expect(extractComponentContracts("not valid {{{", "src/Broken.tsx")).toEqual([]);
  });
});
