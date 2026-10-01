import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import type { AtRuleCandidate, AtRuleContext, ResolvedProperty } from "../../css/model/index.ts";
import { Tooltip } from "./Tooltip.tsx";
import { cx } from "./classNames.ts";

const EMPTY_AT_RULES: readonly AtRuleCandidate[] = [];
const FieldAtRuleContext = createContext<ReadonlyMap<string, readonly AtRuleCandidate[]>>(new Map());

export interface AtRuleContextProviderProps {
  rows: readonly ResolvedProperty[];
  children?: ReactNode;
}

/**
 * Makes the active conditional source context available to fields that only
 * receive a property name (not their resolved property row) as props.
 */
export function AtRuleContextProvider({ rows, children }: AtRuleContextProviderProps): ReactElement {
  const atRulesByProperty = useMemo(() => {
    const next = new Map<string, readonly AtRuleCandidate[]>();
    for (const row of rows) {
      if (row.atRuleCandidates?.length) {
        next.set(row.property, row.atRuleCandidates);
      } else if (row.atRules?.length) {
        next.set(row.property, row.atRules.map((atRule) => ({ ...atRule, active: true })));
      }
    }
    return next;
  }, [rows]);

  return (
    <FieldAtRuleContext.Provider value={atRulesByProperty}>
      {children}
    </FieldAtRuleContext.Provider>
  );
}

export function useFieldAtRules(property: string): readonly AtRuleCandidate[] {
  return useContext(FieldAtRuleContext).get(property) ?? EMPTY_AT_RULES;
}

function labelFor(atRules: readonly (AtRuleContext | AtRuleCandidate)[]): string {
  const kinds = Array.from(new Set(atRules.map((atRule) => atRule.kind)));
  if (kinds.length === 1) {
    if (kinds[0] === "media") return "Media query";
    if (kinds[0] === "container") return "Container query";
    return "Feature query";
  }
  return "Conditional query";
}

function countLabel(label: string, count: number): string {
  const noun = label.toLowerCase().replace(/query$/, count === 1 ? "query" : "queries");
  return `${count} ${noun}`;
}

export interface AtRuleIndicatorProps {
  atRules?: readonly (AtRuleContext | AtRuleCandidate)[];
  className?: string;
}

/** Compact, field-level attribution for the conditional rule that currently wins. */
export function AtRuleIndicator({ atRules = EMPTY_AT_RULES, className }: AtRuleIndicatorProps): ReactElement | null {
  if (atRules.length === 0) return null;
  const label = labelFor(atRules);
  const activeCount = atRules.filter((atRule) => !("active" in atRule) || atRule.active).length;
  const count = countLabel(label, atRules.length);

  return (
    <Tooltip
      content={(
        <div className="at-rule-tooltip__rules">
          {atRules.map((atRule, index) => (
            <div
              className={cx("at-rule-tooltip__rule", (!("active" in atRule) || atRule.active) && "at-rule-tooltip__rule--active")}
              data-active={!("active" in atRule) || atRule.active ? "true" : "false"}
              key={`${atRule.kind}-${atRule.params}-${index}`}
            >
              <code>{atRule.params}</code>
            </div>
          ))}
        </div>
      )}
      delay={0}
      positionerClassName="at-rule-tooltip-positioner"
      popupClassName="at-rule-tooltip"
      data-test="at-rule-tooltip"
    >
      <button
        type="button"
        className={cx("at-rule-indicator", className)}
        data-test="at-rule-indicator"
        aria-label={activeCount > 0 ? `Active ${count}` : count}
      >
        <span className="at-rule-indicator__symbol" aria-hidden="true">{atRules.length}</span>
      </button>
    </Tooltip>
  );
}
