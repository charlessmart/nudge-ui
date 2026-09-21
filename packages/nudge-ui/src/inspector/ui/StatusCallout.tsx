import type { ReactNode, ReactElement } from "react";

export interface StatusCalloutProps {
  children?: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger";
  className?: string;
  "data-test"?: string;
  "data-lost"?: string;
  role?: "status" | "alert";
  "aria-live"?: "off" | "polite" | "assertive";
  "aria-atomic"?: "true" | "false";
}

export function StatusCallout({
  children,
  tone = "neutral",
  className,
  "data-test": dataTest,
  "data-lost": dataLost,
  role,
  "aria-live": ariaLive,
  "aria-atomic": ariaAtomic,
}: StatusCalloutProps): ReactElement {
  return (
    <div
      className={`status-callout status-callout--${tone}${className ? ` ${className}` : ""}`}
      data-test={dataTest}
      data-lost={dataLost}
      role={role}
      aria-live={ariaLive}
      aria-atomic={ariaAtomic}
    >
      {children}
    </div>
  );
}
