import type { ReactNode, ReactElement } from "react";

export interface FieldRowProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  "data-test"?: string;
}

export function FieldRow({ label, children, hint, className, "data-test": dataTest }: FieldRowProps): ReactElement {
  return (
    <label className={`dt-field-row${className ? ` ${className}` : ""}`} data-test={dataTest}>
      <span className="dt-field-row__label">
        {label}
      </span>
      <span className="dt-field-row__control">
        {children}
        {hint ? <span className="dt-field-row__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
