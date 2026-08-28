import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import type { ControlAppearance } from "./ControlSurface.tsx";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  appearance?: ControlAppearance;
  "data-test"?: string;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ compact, appearance = "default", className, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`text-input${compact ? " text-input--compact" : ""}${appearance === "embedded" ? " text-input--embedded" : ""}${className ? ` ${className}` : ""}`}
    />
  );
});
