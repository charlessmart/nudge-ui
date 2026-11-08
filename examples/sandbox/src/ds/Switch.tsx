import "./Switch.css";

export interface SwitchProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export function Switch({ checked = false, disabled = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? "ds-switch ds-switch--on" : "ds-switch"}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    />
  );
}
