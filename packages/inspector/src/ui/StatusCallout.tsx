import type { ReactNode, ReactElement } from "react";

export interface StatusCalloutProps {
  children?: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger";
  className?: string;
  "data-test"?: string;
  "data-lost"?: string;
}

export function StatusCallout({ children, tone = "neutral", className, "data-test": dataTest, "data-lost": dataLost }: StatusCalloutProps): ReactElement {
  return (
    <div className={`status-callout status-callout--${tone}${className ? ` ${className}` : ""}`} data-test={dataTest} data-lost={dataLost}>
      {children}
    </div>
  );
}
