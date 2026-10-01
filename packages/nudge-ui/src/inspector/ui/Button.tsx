import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "disabled";
export type ButtonSize = "default" | "compact" | "large";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  "data-test"?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "default", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      className={`button button--${variant} button--${size}${className ? ` ${className}` : ""}`}
    />
  );
});
