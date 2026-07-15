import type { ButtonHTMLAttributes, ReactElement } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "default" | "compact";
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
