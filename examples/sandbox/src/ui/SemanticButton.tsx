import type { MouseEvent } from "react";
import { buttonSprinkles } from "./buttonSprinkles";

export interface SemanticButtonProps {
  label: string;
  variant: "primary" | "secondary";
  size: "small" | "large";
  disabled: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function SemanticButton({
  label,
  variant,
  size,
  disabled,
  onClick,
}: SemanticButtonProps) {
  return (
    <button
      type="button"
      className={buttonSprinkles({ variant, size })}
      disabled={disabled}
      onClick={onClick}
      data-test="semantic-button"
      data-rendered-variant={variant}
      data-rendered-size={size}
    >
      {label}
    </button>
  );
}
