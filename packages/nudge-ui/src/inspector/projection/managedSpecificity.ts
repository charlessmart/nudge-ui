import type { MatchedRule } from "../../css/model/index.ts";
import { INTERACTION_STATES, type InteractionState } from "../shell/styleState.ts";
import { collectRules, declarationsFromCssom } from "../tokens/resolution/cssomCollector.ts";
import { branchForState, createRuleMatcher } from "../tokens/resolution/ruleMatching.ts";
import { computeSpecificity, selectorPseudoClasses, splitSelectorAtTopLevel } from "../tokens/resolution/selectorSemantics.ts";
import type { StyleRule } from "./managedStylesheet.ts";

const MANAGED_SOURCE = "#nudge-ui-styles";
const ID_BOOST = ":not(#nudge-ui-boost)";
const CLASS_BOOST = ":not([data-nudge-ui-boost])";
const interactionStates = new Set<string>(INTERACTION_STATES);

type Specificity = [ids: number, classes: number, types: number];

/** Quoted attribute values such as `src/App.tsx:1` must not count as classes or pseudo-classes. */
function specificityOf(selector: string): Specificity {
  const value = computeSpecificity(selector.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""'));
  return [Math.floor(value / 1000000), Math.floor(value / 10000) % 100, Math.floor(value / 100) % 100];
}

function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

const longhandMemo = new Map<string, readonly string[] | null>();

/** Null when this CSSOM does not expand the property, as in jsdom. */
function longhands(doc: Document, property: string): readonly string[] | null {
  const cached = longhandMemo.get(property);
  if (cached !== undefined) return cached;
  const style = doc.createElement("div").style;
  style.setProperty(property, "initial");
  const expanded = Array.from({ length: style.length }, (_, index) => style.item(index));
  const result = expanded.length > 0 ? expanded : null;
  longhandMemo.set(property, result);
  return result;
}

/** A shorthand and one of its longhands compete, such as `background` and `background-color`. */
function overlaps(doc: Document, a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith("--") || b.startsWith("--")) return false;
  const aLonghands = longhands(doc, a);
  const bLonghands = longhands(doc, b);
  if (!aLonghands || !bLonghands) return a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
  return aLonghands.some((longhand) => bLonghands.includes(longhand));
}

function stateOf(branch: string): InteractionState {
  const pseudo = selectorPseudoClasses(branch).find(({ name }) => interactionStates.has(name));
  // SAFETY: interactionStates holds exactly INTERACTION_STATES, so a matched name is an InteractionState.
  return (pseudo?.name ?? "base") as InteractionState;
}

/** CSS weighs a selector list by its strongest matching branch; the matcher stops at the first. */
function competingSpecificity(rule: MatchedRule, target: Element, state: InteractionState): Specificity {
  let strongest: Specificity = [0, 0, 0];
  for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
    // The matcher strips the state pseudo-class to test it; the real branch keeps its weight.
    const testable = branchForState(branch.trim(), state);
    if (!testable) continue;
    try {
      if (!target.matches(testable)) continue;
    } catch {
      continue;
    }
    const specificity = specificityOf(branch.trim());
    if (compare(specificity, strongest) > 0) strongest = specificity;
  }
  return strongest;
}

function boostFor(own: Specificity, competitor: Specificity): string {
  if (compare(own, competitor) >= 0) return "";
  // Own IDs can only trail here; matching them leaves classes, then type selectors, to decide.
  const ids = competitor[0] - own[0];
  const classDeficit = competitor[1] - own[1];
  const classes = Math.max(0, classDeficit) + (classDeficit >= 0 && competitor[2] > own[2] ? 1 : 0);
  return ID_BOOST.repeat(ids) + CLASS_BOOST.repeat(classes);
}

/**
 * Raises one selector branch just enough to tie the strongest author rule that sets the same
 * properties on its targets; the managed sheet cascades last, so a tie wins. Layered rules
 * already lose to the unlayered managed sheet, and `!important` rules stay a reported conflict.
 */
function boostBranch(doc: Document, branch: string, properties: readonly string[], rules: MatchedRule[]): string {
  if (branch.includes("::")) return branch;
  const state = stateOf(branch);
  const targetSelector = branchForState(branch, state);
  if (!targetSelector) return branch;
  let targets: HTMLElement[];
  try {
    targets = Array.from(doc.querySelectorAll<HTMLElement>(targetSelector));
  } catch {
    return branch;
  }
  if (targets.length === 0) return branch;
  const matcher = createRuleMatcher(rules, state);
  let strongest: Specificity = [0, 0, 0];
  for (const target of targets) {
    for (const match of matcher.matchesForElement(target).matched) {
      const { rule } = match;
      if (rule.source === MANAGED_SOURCE || rule.layer) continue;
      const competes = rule.declarations.some((declaration) => !declaration.important
        && properties.some((property) => overlaps(doc, property, declaration.property)));
      if (!competes) continue;
      const specificity = competingSpecificity(rule, target, state);
      if (compare(specificity, strongest) > 0) strongest = specificity;
    }
  }
  return branch + boostFor(specificityOf(branch), strongest);
}

/** Null when every branch already outranks its competitors. */
function boostSelector(doc: Document, selector: string, properties: readonly string[], rules: MatchedRule[]): string | null {
  const branches = splitSelectorAtTopLevel(selector, ",").map((branch) => branch.trim());
  const boosted = branches.map((branch) => boostBranch(doc, branch, properties, rules));
  return boosted.every((branch, index) => branch === branches[index]) ? null : boosted.join(", ");
}

export function withCompetingSpecificity(doc: Document, rules: readonly StyleRule[]): StyleRule[] {
  if (rules.length === 0) return [];
  const collected = collectRules(doc).rules;
  return rules.map((rule) => {
    const selector = boostSelector(doc, rule.selector, Object.keys(rule.declarations), collected);
    return selector ? { ...rule, selector } : rule;
  });
}

/** Canvas renderers receive serialized CSS, so they raise the inserted sheet's selectors in place. */
export function boostManagedStylesheet(doc: Document, sheet: CSSStyleSheet): void {
  const view = doc.defaultView;
  if (!view) return;
  const collected = collectRules(doc).rules;
  const visit = (list: CSSRuleList): void => {
    for (const rule of Array.from(list)) {
      if (rule instanceof view.CSSStyleRule) {
        const selector = boostSelector(doc, rule.selectorText, declarationsFromCssom(rule.style).map(({ property }) => property), collected);
        if (selector) rule.selectorText = selector;
      } else if ("cssRules" in rule) {
        // SAFETY: grouping rules (@media, @supports, @container, @layer) expose their children as cssRules.
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  visit(sheet.cssRules);
}
