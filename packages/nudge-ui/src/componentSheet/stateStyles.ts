/** Pseudo-classes the sheet can force through a `data-nudge-ui-sheet-state` ancestor. */
const STATE_PSEUDO = /(?<!:):(hover|active|focus-visible|focus|disabled)(?![\w-])/g;

export const SHEET_STATE_ATTRIBUTE = "data-nudge-ui-sheet-state";

export interface StatePseudoUsage {
  hover: boolean;
  focus: boolean;
  active: boolean;
  disabled: boolean;
}

/** Each state pseudo also matches inside a cell that forces that state. */
export function rewriteStateSelector(selector: string): string {
  return selector.replace(STATE_PSEUDO, (_match, name: string) => {
    const state = name === "focus" ? "focus-visible" : name;
    return `:is(:${name}, [${SHEET_STATE_ATTRIBUTE}="${state}"] *)`;
  });
}

export type StatePseudo = keyof StatePseudoUsage;

/** Per state, selectors with every state pseudo neutralised, so a sheet can ask which states style its own elements. */
export type StateSelectors = Record<StatePseudo, Set<string>>;

export function emptyStateSelectors(): StateSelectors {
  return { hover: new Set(), focus: new Set(), active: new Set(), disabled: new Set() };
}

function pseudoState(name: string): StatePseudo {
  if (name === "hover" || name === "active" || name === "disabled") return name;
  return "focus";
}

/**
 * Drops the state condition from a selector: a state pseudo matches anything, except inside `:not()`, where it must
 * match nothing, so `.b:hover:not(.disabled, :disabled)` still finds an enabled `.b`.
 */
export function neutralizeStatePseudos(selector: string): string {
  let result = "";
  const negated: boolean[] = [];
  let index = 0;
  while (index < selector.length) {
    const rest = selector.slice(index);
    const opening = /^:([\w-]+)\(/.exec(rest);
    if (opening) {
      negated.push(opening[1] === "not" || (negated.at(-1) ?? false));
      result += opening[0];
      index += opening[0].length;
      continue;
    }
    if (rest[0] === "(") negated.push(negated.at(-1) ?? false);
    if (rest[0] === ")") negated.pop();
    const state = /^:(?:hover|active|focus-visible|focus|disabled)(?![\w-])/.exec(rest);
    if (state && !selector.slice(0, index).endsWith(":")) {
      result += negated.at(-1) ? ":is([data-nudge-ui-never])" : ":is(*)";
      index += state[0].length;
      continue;
    }
    result += rest[0];
    index += 1;
  }
  return result;
}

export function selectorStateUsage(selector: string, usage: StatePseudoUsage, selectors?: StateSelectors): void {
  let neutral: string | null = null;
  for (const match of selector.matchAll(STATE_PSEUDO)) {
    const state = pseudoState(match[1]!);
    usage[state] = true;
    if (!selectors) continue;
    neutral ??= neutralizeStatePseudos(selector);
    selectors[state].add(neutral);
  }
}

/** Which states have rules that style an element inside `scopes`; selectors the browser rejects are ignored. */
export function statesUsedWithin(scopes: readonly Element[], selectors: StateSelectors): StatePseudoUsage {
  const used = (state: StatePseudo): boolean => [...selectors[state]].some((selector) => scopes.some((scope) => {
    try {
      return scope.querySelector(selector) !== null;
    } catch {
      return false;
    }
  }));
  return { hover: used("hover"), focus: used("focus"), active: used("active"), disabled: used("disabled") };
}

/** The slice of a CSSOM rule this module reads; real rules and test doubles both satisfy it. */
export interface RuleLike {
  type?: number;
  cssText: string;
  selectorText?: string;
  style?: { cssText: string };
  cssRules?: ArrayLike<RuleLike>;
}

const KEYFRAMES_RULE = 7;
const FONT_FACE_RULE = 5;

function serializeRule(rule: RuleLike, usage: StatePseudoUsage, selectors: StateSelectors): string {
  if (typeof rule.selectorText === "string") {
    selectorStateUsage(rule.selectorText, usage, selectors);
    const nested = rule.cssRules ? serializeRules(rule.cssRules, usage, selectors) : "";
    return `${rewriteStateSelector(rule.selectorText)}{${rule.style?.cssText ?? ""}${nested}}`;
  }
  if (rule.type === KEYFRAMES_RULE || rule.type === FONT_FACE_RULE || !rule.cssRules) return "";
  const open = rule.cssText.indexOf("{");
  if (open < 0) return "";
  const inner = serializeRules(rule.cssRules, usage, selectors);
  return inner === "" ? "" : `${rule.cssText.slice(0, open).trim()}{${inner}}`;
}

function serializeRules(rules: ArrayLike<RuleLike>, usage: StatePseudoUsage, selectors: StateSelectors): string {
  let css = "";
  for (let index = 0; index < rules.length; index++) css += serializeRule(rules[index]!, usage, selectors);
  return css;
}

/**
 * The document's style rules with every state pseudo made forceable, in cascade order so the copy
 * keeps the original specificity and source-order relationships.
 */
export function buildStateStyles(sheets: ReadonlyArray<ArrayLike<RuleLike>>): {
  css: string;
  usage: StatePseudoUsage;
  selectors: StateSelectors;
} {
  const usage: StatePseudoUsage = { hover: false, focus: false, active: false, disabled: false };
  const selectors = emptyStateSelectors();
  let css = "";
  for (const rules of sheets) css += serializeRules(rules, usage, selectors);
  return { css, usage, selectors };
}
