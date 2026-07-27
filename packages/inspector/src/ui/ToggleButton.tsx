import { forwardRef } from "react";
import { Toggle } from "@base-ui/react/toggle";
import type { ButtonVariant, ButtonSize } from "./Button.tsx";

interface ToggleButtonProps extends Omit<Toggle.Props<string>, "className"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  "data-test"?: string;
  className?: string;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { label, variant = "secondary", size = "default", className, ...props },
  ref,
) {
  return (
    <Toggle
      ref={ref}
      {...props}
      aria-label={label}
      className={`dt-toggle-button dt-toggle-button--${variant} dt-toggle-button--${size}${className ? ` ${className}` : ""}`}
    />
  );
});
