import type { ReactNode, ReactElement } from "react";

export interface BadgeProps {
  children?: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger";
  className?: string;
  "data-test"?: string;
}

export function Badge({ children, tone = "neutral", className, "data-test": dataTest }: BadgeProps): ReactElement {
  return (
    <span className={`badge badge--${tone}${className ? ` ${className}` : ""}`} data-test={dataTest}>
      {children}
    </span>
  );
}
