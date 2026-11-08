import "./Checkbox.css";

export interface CheckboxProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({ label, checked = false, disabled = false, onChange }: CheckboxProps) {
  const className = ["ds-checkbox", checked && "ds-checkbox--checked", disabled && "ds-checkbox--disabled"].filter(Boolean).join(" ");
  return (
    <label className={className}>
      <input type="checkbox" hidden checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
      <span className="ds-checkbox__box" aria-hidden="true">
        {checked ? <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
      </span>
      {label}
    </label>
  );
}
