import { toggleSprinkles } from "./toggleSprinkles";

export interface SemanticToggleProps {
  variant: "accent" | "success" | "danger";
  size: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function SemanticToggle({ variant, size, disabled }: SemanticToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={false}
      className={toggleSprinkles({ variant, size })}
      disabled={disabled}
      data-test="semantic-toggle"
      data-rendered-variant={variant}
      data-rendered-size={size}
    >
      <span className="semantic-toggle__track">
        <span className="semantic-toggle__thumb" />
      </span>
    </button>
  );
}
