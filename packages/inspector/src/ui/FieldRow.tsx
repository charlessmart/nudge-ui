import type { ReactNode, ReactElement } from "react";
import { formatInspectorLabel } from "./labels.ts";
import type { AtRuleContext } from "../tokens/resolution.ts";
import { AtRuleIndicator, useFieldAtRules } from "./AtRuleContext.tsx";

export interface FieldRowProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  property?: string;
  atRules?: readonly AtRuleContext[];
  className?: string;
  "data-test"?: string;
}

export function FieldRow({ label, children, hint, property, atRules, className, "data-test": dataTest }: FieldRowProps): ReactElement {
  const displayLabel = typeof label === "string" ? formatInspectorLabel(label) : label;
  const inheritedAtRules = useFieldAtRules(property ?? "");
  const fieldAtRules = atRules ?? inheritedAtRules;
  const hasAtRules = fieldAtRules.length > 0;

  return (
    <label className={`dt-field-row${className ? ` ${className}` : ""}`} data-test={dataTest}>
      <span className="dt-field-row__label">
        {displayLabel}
      </span>
      <span className="dt-field-row__control" data-has-at-rule={hasAtRules ? "true" : undefined}>
        {children}
        <AtRuleIndicator atRules={fieldAtRules} />
        {hint ? <span className="dt-field-row__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
