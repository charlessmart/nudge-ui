import type { ReactNode, ReactElement } from "react";
import { formatInspectorLabel } from "./labels.ts";

export interface FieldRowProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  "data-test"?: string;
}

export function FieldRow({ label, children, hint, className, "data-test": dataTest }: FieldRowProps): ReactElement {
  const displayLabel = typeof label === "string" ? formatInspectorLabel(label) : label;

  return (
    <label className={`dt-field-row${className ? ` ${className}` : ""}`} data-test={dataTest}>
      <span className="dt-field-row__label">
        {displayLabel}
      </span>
      <span className="dt-field-row__control">
        {children}
        {hint ? <span className="dt-field-row__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
