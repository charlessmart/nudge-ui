import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { IconAt } from "@tabler/icons-react";
import type { AtRuleContext, ResolvedProperty } from "@design-tool/css/model";

const EMPTY_AT_RULES: readonly AtRuleContext[] = [];
const FieldAtRuleContext = createContext<ReadonlyMap<string, readonly AtRuleContext[]>>(new Map());

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
    const next = new Map<string, readonly AtRuleContext[]>();
    for (const row of rows) {
      if (row.atRules?.length) next.set(row.property, row.atRules);
    }
    return next;
  }, [rows]);

  return (
    <FieldAtRuleContext.Provider value={atRulesByProperty}>
      {children}
    </FieldAtRuleContext.Provider>
  );
}

export function useFieldAtRules(property: string): readonly AtRuleContext[] {
  return useContext(FieldAtRuleContext).get(property) ?? EMPTY_AT_RULES;
}

function labelFor(atRules: readonly AtRuleContext[]): string {
  const kinds = Array.from(new Set(atRules.map((atRule) => atRule.kind)));
  if (kinds.length === 1) {
    if (kinds[0] === "media") return "Media query";
    if (kinds[0] === "container") return "Container query";
    return "Feature query";
  }
  return "Conditional query";
}

function compactLabelFor(atRules: readonly AtRuleContext[]): string {
  const kinds = Array.from(new Set(atRules.map((atRule) => atRule.kind)));
  if (kinds.length === 1) {
    if (kinds[0] === "media") return "Media";
    if (kinds[0] === "container") return "Container";
    return "Supports";
  }
  return "Queries";
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return document.getElementById("design-tool-root")?.shadowRoot ?? document.body;
}

export interface AtRuleIndicatorProps {
  atRules?: readonly AtRuleContext[];
  className?: string;
}

/** Compact, field-level attribution for the conditional rule that currently wins. */
export function AtRuleIndicator({ atRules = EMPTY_AT_RULES, className }: AtRuleIndicatorProps): ReactElement | null {
  if (atRules.length === 0) return null;
  const label = labelFor(atRules);

  return (
    <Tooltip.Provider>
      <Tooltip.Root disableHoverablePopup>
        <Tooltip.Trigger
          type="button"
          delay={0}
          className={`dt-at-rule-indicator${className ? ` ${className}` : ""}`}
          data-test="at-rule-indicator"
          aria-label={`Active ${label.toLowerCase()}`}
        >
          <IconAt size={13} stroke={1.8} aria-hidden="true" />
          <span>{compactLabelFor(atRules)}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal container={portalContainer()}>
          <Tooltip.Positioner className="dt-at-rule-tooltip-positioner" side="top" align="end" sideOffset={7}>
            <Tooltip.Popup className="dt-at-rule-tooltip" data-test="at-rule-tooltip">
              <div className="dt-at-rule-tooltip__status">
                <span className="dt-at-rule-tooltip__status-dot" aria-hidden="true" />
                Active in current preview
              </div>
              <div className="dt-at-rule-tooltip__rules">
                {atRules.map((atRule, index) => (
                  <div className="dt-at-rule-tooltip__rule" key={`${atRule.kind}-${atRule.params}-${index}`}>
                    <span className="dt-at-rule-tooltip__kind">@{atRule.kind}</span>
                    <code>{atRule.params}</code>
                  </div>
                ))}
              </div>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
