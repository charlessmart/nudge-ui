import type { ReactNode } from "react";

export interface DemoButtonProps {
  label: string;
  variant: "primary" | "secondary" | "tertiary";
  disabled?: boolean;
  showArrow?: boolean;
}

export function DemoButton({
  label,
  variant,
  disabled = false,
  showArrow = false,
}: DemoButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`demo-button demo-button--${variant}`}
      disabled={disabled}
    >
      {label}
      {showArrow && (
        <svg className="demo-button-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
