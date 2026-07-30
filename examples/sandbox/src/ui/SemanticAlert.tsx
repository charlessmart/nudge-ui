import type { ReactNode } from "react";
import { alertSprinkles } from "./alertSprinkles";

export interface SemanticAlertProps {
  children: ReactNode;
  variant: "info" | "success" | "warning" | "danger";
  dismissible?: boolean;
}

export function SemanticAlert({ children, variant, dismissible }: SemanticAlertProps) {
  return (
    <div
      className={alertSprinkles({ variant })}
      role="alert"
      data-test="semantic-alert"
      data-rendered-variant={variant}
    >
      <span>{children}</span>
      {dismissible && (
        <button
          type="button"
          className="semantic-alert__dismiss"
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
}
