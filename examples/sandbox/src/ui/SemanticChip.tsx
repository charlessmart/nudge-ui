import type { ReactNode } from "react";
import { chipSprinkles } from "./chipSprinkles";

export interface SemanticChipProps {
  children: ReactNode;
  variant: "default" | "primary" | "success" | "warning" | "danger";
  size: "sm" | "md";
  closable?: boolean;
}

export function SemanticChip({ children, variant, size, closable }: SemanticChipProps) {
  return (
    <span
      className={chipSprinkles({ variant, size })}
      data-test="semantic-chip"
      data-rendered-variant={variant}
      data-rendered-size={size}
    >
      {children}
      {closable && (
        <button type="button" className="semantic-chip__close" aria-label="Close">
          &times;
        </button>
      )}
    </span>
  );
}
