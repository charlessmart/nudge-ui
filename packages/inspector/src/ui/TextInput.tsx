import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  "data-test"?: string;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ compact, className, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`dt-text-input${compact ? " dt-text-input--compact" : ""}${className ? ` ${className}` : ""}`}
    />
  );
});
