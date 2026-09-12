import type { ReactNode } from "react";
import "../styles/button.css";

/**
 * The three emphases a button can take.
 *
 * The union is written inline on the prop below rather than behind a type
 * alias: the inspector's contract extractor reads literal unions declared in
 * the interface, but does not follow a named alias to its definition. The
 * exported alias is derived from the interface so there is still one source
 * of truth.
 */
export interface ButtonProps {
  /** Which emphasis to render. Drives the .button--<variant> class. */
  variant: "primary" | "secondary" | "tertiary";
  /** Visible button text. */
  label: string;
  /** Renders the button in a non-interactive, dimmed state. */
  disabled?: boolean;
  /** Invoked on click. Absent for purely presentational mockups. */
  onClick?: () => void;
}

export type ButtonVariant = ButtonProps["variant"];

export function Button({
  variant,
  label,
  disabled = false,
  onClick,
}: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`button button--${variant}`}
      data-rendered-variant={variant}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
