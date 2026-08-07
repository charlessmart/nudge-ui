import type { ReactNode, ReactElement } from "react";
import { formatInspectorLabel } from "./labels.ts";
import type { AtRuleContext } from "@design-tool/css/model";
import { AtRuleIndicator, useFieldAtRules } from "./AtRuleContext.tsx";

export interface FieldRowProps {
  label: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
  property?: string;
  atRules?: readonly AtRuleContext[];
  className?: string;
  "data-test"?: string;
}

export function FieldRow({ label, children, action, hint, property, atRules, className, "data-test": dataTest }: FieldRowProps): ReactElement {
  const displayLabel = typeof label === "string" ? formatInspectorLabel(label) : label;
  const inheritedAtRules = useFieldAtRules(property ?? "");
  const fieldAtRules = atRules ?? inheritedAtRules;
  const hasAtRules = fieldAtRules.length > 0;
  const rowClassName = [
    "dt-field-row",
    action ? "dt-field-row--has-action" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <label className={rowClassName} data-test={dataTest}>
      <span className="dt-field-row__label">
        {displayLabel}
      </span>
      <span className="dt-field-row__control" data-has-at-rule={hasAtRules ? "true" : undefined}>
        {children}
        <AtRuleIndicator atRules={fieldAtRules} />
        {hint ? <span className="dt-field-row__hint">{hint}</span> : null}
      </span>
      {action ? <span className="dt-field-row__action">{action}</span> : null}
    </label>
  );
}
