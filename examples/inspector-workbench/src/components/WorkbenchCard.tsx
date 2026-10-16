import type { ReactNode } from "react";

export interface WorkbenchCardProps {
  children: ReactNode;
  variant: "elevated" | "outlined" | "flat";
  padding: "small" | "medium" | "large";
}

export function WorkbenchCard({ children, variant, padding }: WorkbenchCardProps) {
  return <div className={`wb-card wb-card--${variant} wb-card--${padding}`}>{children}</div>;
}
