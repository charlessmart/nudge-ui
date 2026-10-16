export interface WorkbenchButtonProps {
  label: string;
  variant: "primary" | "secondary" | "ghost";
  size: "small" | "large";
  disabled: boolean;
}

export function WorkbenchButton({ label, variant, size, disabled }: WorkbenchButtonProps) {
  return (
    <button
      type="button"
      className={`wb-button wb-button--${variant} wb-button--${size}`}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
