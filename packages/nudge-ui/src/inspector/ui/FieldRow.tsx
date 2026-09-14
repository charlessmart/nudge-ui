import type { ReactNode, ReactElement } from "react";
import { formatInspectorLabel } from "./labels.ts";
import type { AtRuleContext } from "../../css/model/index.ts";
import { AtRuleIndicator, useFieldAtRules } from "./AtRuleContext.tsx";

export interface FieldRowProps {
  label: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
  hideLabel?: boolean;
  property?: string;
  atRules?: readonly AtRuleContext[];
  className?: string;
  "data-test"?: string;
}

export function FieldRow({ label, children, action, hint, hideLabel = false, property, atRules, className, "data-test": dataTest }: FieldRowProps): ReactElement {
  const displayLabel = typeof label === "string" ? formatInspectorLabel(label) : label;
  const inheritedAtRules = useFieldAtRules(property ?? "");
  const fieldAtRules = atRules ?? inheritedAtRules;
  const hasAtRules = fieldAtRules.length > 0;
  const rowClassName = [
    "field-row",
    action ? "field-row--has-action" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <label className={rowClassName} data-test={dataTest}>
      <span className={`field-row__label${hideLabel ? " field-row__label--hidden" : ""}`}>
        {displayLabel}
      </span>
      <span className="field-row__control" data-has-at-rule={hasAtRules ? "true" : undefined}>
        {children}
        <AtRuleIndicator atRules={fieldAtRules} />
        {hint ? <span className="field-row__hint">{hint}</span> : null}
      </span>
      {action ? <span className="field-row__action">{action}</span> : null}
    </label>
  );
}
