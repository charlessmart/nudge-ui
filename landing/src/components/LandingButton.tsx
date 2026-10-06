import type { ButtonHTMLAttributes, ReactNode } from "react";

type LandingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary";
};

export function LandingButton({ children, className, variant = "primary", ...props }: LandingButtonProps): ReactNode {
  return (
    <button
      {...props}
      className={`landing-button landing-button--${variant}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}
