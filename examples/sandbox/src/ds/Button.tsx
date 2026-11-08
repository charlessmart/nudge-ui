import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "critical";
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}

/** Spreads its remaining props onto the root, like most shadcn-style buttons. */
export function Button({ variant = "primary", size = "md", loading = false, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={["ds-button", `ds-button--${variant}`, `ds-button--${size}`, className].filter(Boolean).join(" ")}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ds-button__spinner" aria-hidden="true" /> : children}
    </button>
  );
}
