import type { ButtonHTMLAttributes, ReactElement } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "disabled";
export type ButtonSize = "default" | "compact";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  "data-test"?: string;
};

export function Button({ variant = "secondary", size = "default", className, ...props }: ButtonProps): ReactElement {
  return (
    <button
      {...props}
      className={`dt-button dt-button--${variant} dt-button--${size}${className ? ` ${className}` : ""}`}
    />
  );
}
