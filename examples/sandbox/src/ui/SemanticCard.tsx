import type { ReactNode } from "react";
import { cardSprinkles } from "./cardSprinkles";

export interface SemanticCardProps {
  children: ReactNode;
  variant: "elevated" | "outlined" | "flat";
  padding: "sm" | "md" | "lg";
  bordered?: boolean;
}

export function SemanticCard({ children, variant, padding, bordered }: SemanticCardProps) {
  return (
    <div
      className={cardSprinkles({ variant, padding, bordered })}
      data-test="semantic-card"
      data-rendered-variant={variant}
      data-rendered-padding={padding}
    >
      {children}
    </div>
  );
}
