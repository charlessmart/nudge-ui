import type { CSSProperties, ReactElement } from "react";

export interface ColorSwatchProps {
  color: string;
  className?: string;
  "data-test"?: string;
}

export function ColorSwatch({ color, className, "data-test": dataTest }: ColorSwatchProps): ReactElement {
  return (
    <span
      className={`dt-color-swatch${className ? ` ${className}` : ""}`}
      data-test={dataTest}
      style={{ "--dt-swatch-color": color || "transparent" } as CSSProperties}
      aria-hidden="true"
    />
  );
}
