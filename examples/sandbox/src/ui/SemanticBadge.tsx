import type { ReactNode } from "react";
import { badgeSprinkles } from "./badgeSprinkles";

export interface SemanticBadgeProps {
  children: ReactNode;
  variant: "neutral" | "success" | "warning" | "danger" | "info";
  size: "sm" | "md" | "lg";
}

export function SemanticBadge({ children, variant, size }: SemanticBadgeProps) {
  return (
    <span
      className={badgeSprinkles({ variant, size })}
      data-test="semantic-badge"
      data-rendered-variant={variant}
      data-rendered-size={size}
    >
      {children}
    </span>
  );
}
