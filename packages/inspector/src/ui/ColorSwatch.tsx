import type { CSSProperties, ReactElement } from "react";

export interface ColorSwatchProps {
  color: string;
  size?: "small" | "default";
  className?: string;
  "data-test"?: string;
}

export function ColorSwatch({ color, size = "default", className, "data-test": dataTest }: ColorSwatchProps): ReactElement {
  return (
    <span
      className={`dt-color-swatch dt-color-swatch--${size}${className ? ` ${className}` : ""}`}
      data-test={dataTest}
      style={{ "--dt-swatch-color": color || "transparent" } as CSSProperties}
      aria-hidden="true"
    />
  );
}
