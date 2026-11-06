import type { ReactNode } from "react";
import "./Badge.css";

export interface BadgeProps {
  tone?: "neutral" | "success" | "warning" | "critical";
  children?: ReactNode;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}
