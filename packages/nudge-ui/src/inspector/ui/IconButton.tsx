import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import type { ButtonSize, ButtonVariant } from "./Button.tsx";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Colors the active (`data-active`) state: the accent by default, or the quiet well. */
  activeStyle?: "accent" | "well";
  "data-test"?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "secondary", size = "default", activeStyle, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      data-active-style={activeStyle}
      className={`icon-button icon-button--${variant} icon-button--${size}${className ? ` ${className}` : ""}`}
    />
  );
});
