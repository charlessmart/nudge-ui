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

  it("ignores unconstrained and complex props", () => {
    const code = `
      type CardProps = { title: string; count: number; data: object; mode: "only" };
      export function Card(props: CardProps) { return <article />; }
    `;
    expect(extractComponentContracts(code, "src/ui/Card.tsx")).toEqual([]);
  });

  it("returns an empty catalog for invalid source", () => {
    expect(extractComponentContracts("not valid {{{", "src/Broken.tsx")).toEqual([]);
  });
});
