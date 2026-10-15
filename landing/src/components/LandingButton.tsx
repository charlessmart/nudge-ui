import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type LandingButtonVariant = "primary" | "secondary" | "tertiary";

type LandingButtonProps =
  | (ButtonHTMLAttributes<HTMLButtonElement> & { variant?: LandingButtonVariant; href?: undefined })
  | (AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: LandingButtonVariant; href: string });

export function LandingButton({ children, className, variant = "primary", ...props }: LandingButtonProps): ReactNode {
  const classes = `landing-button landing-button--${variant}${className ? ` ${className}` : ""}`;
  if (props.href !== undefined) {
    return (
      <a {...props} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button {...props} className={classes}>
      {children}
    </button>
  );
}
