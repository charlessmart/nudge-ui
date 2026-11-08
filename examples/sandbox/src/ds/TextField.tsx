import type { InputHTMLAttributes } from "react";
import "./TextField.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

export function TextField({ label, invalid = false, ...props }: TextFieldProps) {
  return (
    <label className={invalid ? "ds-field ds-field--invalid" : "ds-field"}>
      {label ? <span className="ds-field__label">{label}</span> : null}
      <input className="ds-field__input" aria-invalid={invalid || undefined} {...props} />
      {invalid ? <span className="ds-field__hint">This field needs attention</span> : null}
    </label>
  );
}
