import type { TokenEntry } from "virtual:design-tokens";
import { tokenCatalog, tokens } from "virtual:design-tokens";
import { INTERACTION_STATES } from "../styleState.ts";
import type { InteractionState } from "../styleState.ts";

export interface ResolvedProperty {
  property: string;
  tokenName: string | null;
  declaredValue: string;
  resolvedValue: string;
  confidence: "exact" | "probable" | "unknown";
  evidence: AttributionEvidence;
}

export interface AttributionEvidence {
  selector?: string;
  sourceOrder?: number;
  specificity?: number;
  important?: boolean;
  layer?: string;
  inheritedFrom?: string;
  inaccessibleStylesheet?: boolean;
  reason: string;
}

export interface TokenTable {
  [varName: string]: TokenEntry;
}

interface StyleDeclaration {
  property: string;
  value: string;
  important?: boolean;
}

export interface MatchedRule {
  selectorText: string;
  declarations: StyleDeclaration[];
  specificity: number;
  sourceOrder?: number;
  layer?: string;
  active?: boolean;
}

const MAX_PROPERTIES = 100;
const VAR_REF = /var\(\s*(--[\w-]+)/g;
const SPACING_SIDES: Record<string, readonly string[]> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
};

export function buildTokenTable(entries: TokenEntry[]): TokenTable {
  const table: TokenTable = {};
  for (const entry of entries) table[entry.name] = entry;
  return table;
}

let tableCache: TokenTable | null = null;
let tableSource: TokenEntry[] | null = null;

export function getTokenTable(): TokenTable {
  if (tableCache !== null && tableSource === tokens) return tableCache;
  tableCache = buildTokenTable(tokens);
  tableSource = tokens;
  return tableCache;
}

export function getTokenEntriesForElement(el: HTMLElement): TokenEntry[] {
  const computed = getComputedStyle(el);
  return tokenCatalog.map((definition) => ({
    name: definition.cssName,
    value: computed.getPropertyValue(definition.cssName).trim()
      || definition.declarations[0]?.value
      || "",
    source: definition.declarations[0]?.source ?? "",
  }));
}

function normalizeInElementContext(el: HTMLElement, property: string, value: string): string {
  const probe = document.createElement(el.tagName.toLowerCase());
  probe.setAttribute("data-design-tool", "attribution-probe");
  probe.style.setProperty(property, value, "important");
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) document.body.appendChild(probe);
  const normalized = getComputedStyle(probe).getPropertyValue(property).trim();
  probe.remove();
  return normalized;
}

function candidateMatchesPainted(el: HTMLElement, row: ResolvedProperty, painted: string): boolean {
  if (!row.tokenName || !/^var\(\s*--[\w-]+\s*\)$/.test(row.declaredValue)) return false;
  return normalizeInElementContext(el, row.property, row.declaredValue) === painted.trim();
}

function resolveRef(
  ref: string,
  tokenTable: TokenTable,
  visited: Set<string>,
): { known: boolean; resolvedValue: string } {
  if (visited.has(ref)) {
    const entry = tokenTable[ref];
    return { known: entry !== undefined, resolvedValue: entry ? entry.value : `var(${ref})` };
  }
  const entry = tokenTable[ref];
  if (!entry) return { known: false, resolvedValue: `var(${ref})` };
  const nextVisited = new Set(visited);
  nextVisited.add(ref);
  const inner = resolveTokenValueInner(entry.value, tokenTable, nextVisited);
  return { known: true, resolvedValue: inner.resolvedValue };
}

function resolveTokenValueInner(
  value: string,
  tokenTable: TokenTable,
  visited: Set<string>,
): { tokenName: string | null; resolvedValue: string } {
  const trimmed = value.trim();
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  VAR_REF.lastIndex = 0;
  while ((m = VAR_REF.exec(trimmed)) !== null) {
    const name = m[1];
    if (name) refs.push(name);
  }
  if (refs.length === 0) return { tokenName: null, resolvedValue: trimmed };
  for (const ref of refs) {
    const res = resolveRef(ref, tokenTable, visited);
    if (res.known) return { tokenName: ref, resolvedValue: res.resolvedValue };
  }
  return { tokenName: null, resolvedValue: trimmed };
}

export function resolveTokenValue(
  value: string,
  tokenTable: TokenTable,
): { tokenName: string | null; resolvedValue: string } {
  return resolveTokenValueInner(value, tokenTable, new Set());
}

function splitTopLevelWhitespace(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && /\s/.test(char ?? "")) {
      if (i > start) parts.push(value.slice(start, i));
      start = i + 1;
    }
  }

  if (start < value.length) parts.push(value.slice(start));
  return parts;
}

function expandFourValueShorthand<T>(values: readonly T[]): [T, T, T, T] | null {
  if (values.length === 0 || values.length > 4) return null;
  const top = values[0]!;
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  if (values.length === 3) return [top, right, bottom, right];
  if (values.length === 2) return [top, right, top, right];
  return [top, right, bottom, left];
}

interface ResolvedDeclaration {
  property: string;
  declaredValue: string;
  tokenName: string | null;
  resolvedValue: string;
  important?: boolean;
}

function resolveDeclaration(
  declaration: StyleDeclaration,
  tokenTable: TokenTable,
): ResolvedDeclaration[] {
  const sides = SPACING_SIDES[declaration.property.toLowerCase()];
  if (!sides) {
    const res = resolveTokenValue(declaration.value, tokenTable);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
    }];
  }

  const rawValues = splitTopLevelWhitespace(declaration.value);
  if (rawValues.length === 0 || rawValues.length > 4) {
    const res = resolveTokenValue(declaration.value, tokenTable);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
    }];
  }

  // A custom property can itself contain a shorthand value, for example
  // `margin: var(--space-set)`. Expand that value before assigning sides.
  const resolvedValues = rawValues.flatMap((rawValue) => {
    const res = resolveTokenValue(rawValue, tokenTable);
    const tokenValues = res.tokenName ? splitTopLevelWhitespace(res.resolvedValue) : [];
    if (res.tokenName && /^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(rawValue) && tokenValues.length > 1) {
      return tokenValues.map((resolvedValue) => ({
        declaredValue: rawValue,
        tokenName: res.tokenName,
        resolvedValue,
      }));
    }
    return [{ declaredValue: rawValue, tokenName: res.tokenName, resolvedValue: res.resolvedValue }];
  });
  const sideValues = expandFourValueShorthand(resolvedValues);
  if (!sideValues) {
    const res = resolveTokenValue(declaration.value, tokenTable);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
    }];
  }

  return sides.map((property, index) => ({
    property,
    ...sideValues[index]!,
    important: declaration.important,
  }));
}

export function resolvePropertiesFromRules(
  el: HTMLElement,
  rules: MatchedRule[],
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const map = new Map<string, ResolvedProperty>();

  // Sort by specificity ascending so rules are processed lowest-first.
  // Map.set() naturally overwrites: higher specificity rules processed later win,
  // and equal-specificity rules get "last in stylesheet order wins" (stable sort).
  const sorted = [...rules].sort((a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0));

  for (const rule of sorted) {
    if (rule.active === false) continue;
    const branch = matchingSelectorBranch(el, rule.selectorText);
    if (!branch) continue;
    const specificity = computeSpecificity(branch);
    for (const decl of rule.declarations) {
      for (const resolved of resolveDeclaration(decl, tokenTable)) {
        const candidate: ResolvedProperty = {
          property: resolved.property,
          tokenName: resolved.tokenName,
          declaredValue: resolved.declaredValue,
          resolvedValue: resolved.resolvedValue,
          confidence: resolved.tokenName ? "probable" : "unknown",
          evidence: {
            selector: branch,
            sourceOrder: rule.sourceOrder,
            specificity,
            important: Boolean(resolved.important),
            layer: rule.layer,
            reason: resolved.tokenName ? "authored declaration references a catalog token" : "no catalog token reference",
          },
        };
        const previous = map.get(resolved.property);
        if (!previous || compareCandidate(candidate, previous) >= 0) map.set(resolved.property, candidate);
      }
    }
  }
  return Array.from(map.values()).slice(0, MAX_PROPERTIES);
}

function matchingSelectorBranch(el: Element, selectorText: string): string | null {
  for (const branch of splitTopLevel(selectorText, ",")) {
    try {
      if (el.matches(branch.trim())) return branch.trim();
    } catch { /* invalid/unsupported selector */ }
  }
  return null;
}

function compareCandidate(a: ResolvedProperty, b: ResolvedProperty): number {
  const ai = a.evidence.important ? 1 : 0;
  const bi = b.evidence.important ? 1 : 0;
  if (ai !== bi) return ai - bi;
  // Unlayered author rules outrank layered author rules. Layer ordering within
  // named layers is represented by source order until a layer-order statement
  // can be observed by CSSOM.
  const al = a.evidence.layer ? 0 : 1;
  const bl = b.evidence.layer ? 0 : 1;
  if (al !== bl) return al - bl;
  if ((a.evidence.specificity ?? 0) !== (b.evidence.specificity ?? 0)) {
    return (a.evidence.specificity ?? 0) - (b.evidence.specificity ?? 0);
  }
  return (a.evidence.sourceOrder ?? 0) - (b.evidence.sourceOrder ?? 0);
}

function parseDeclarations(cssText: string): StyleDeclaration[] {
  const out: StyleDeclaration[] = [];
  for (const part of cssText.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const property = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!property || !value) continue;
    const important = /!\s*important\s*$/i.test(value);
    out.push({ property, value: value.replace(/!\s*important\s*$/i, "").trim(), important });
  }
  return out;
}

function extractParenContent(s: string, openIdx: number): { content: string; end: number } {
  let depth = 0;
  let i = openIdx;
  while (i < s.length && s[i] !== "(") i++;
  if (i >= s.length) return { content: "", end: openIdx };
  depth = 1;
  const start = i + 1;
  i++;
  while (i < s.length && depth > 0) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return { content: s.slice(start, i - 1).trim(), end: i };
}

export function computeSpecificity(selectorText: string): number {
  let s = selectorText.trim();

  // Handle comma-separated selectors: use the max specificity of any part
  const commaParts = splitTopLevel(s, ",");
  if (commaParts.length > 1) {
    let max = 0;
    for (const part of commaParts) {
      const spec = computeSpecificity(part);
      if (spec > max) max = spec;
    }
    return max;
  }

  let idCount = 0;
  let classCount = 0;
  let elementCount = 0;

  // Split by combinators (space, >, +, ~) to get individual compound selectors
  // but only at the top level (not inside :not()/:is()/:has()/:where() parens)
  const compounds = splitTopLevel(s);

  for (const compound of compounds) {
    let cs = compound;

    // Handle :not(), :is(), :has(), :where() — extract and remove the entire
    // :name(...) block including args so their content isn't double-counted
    // by subsequent class/ID/element regexes
    const pseudoFuncRe = /:(not|is|has|where)\(/g;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = pseudoFuncRe.exec(cs)) !== null) {
      const name = funcMatch[1]!;
      const openIdx = funcMatch.index;
      const { content, end } = extractParenContent(cs, openIdx + funcMatch[0].length - 1);
      const argSpec = content ? computeSpecificity(content) : 0;
      if (name !== "where") {
        idCount += Math.floor(argSpec / 1000000);
        classCount += Math.floor(argSpec / 10000) % 100;
        elementCount += Math.floor(argSpec / 100) % 100;
      }
      // Remove the entire :name(...) block completely so args aren't re-counted
      cs = cs.slice(0, openIdx) + " " + cs.slice(end);
      // Reset regex lastIndex since we modified the string
      pseudoFuncRe.lastIndex = openIdx + 1;
    }

    // Now cs has had all :not()/:is()/:has()/:where() removed
    // Count ID selectors
    cs = cs.replace(/#[\w-]+/g, () => { idCount++; return " "; });

    // Count class selectors
    cs = cs.replace(/\.[\w-]+/g, () => { classCount++; return " "; });

    // Count attribute selectors
    cs = cs.replace(/\[[^\]]*\]/g, () => { classCount++; return " "; });

    // Count pseudo-elements (double colon) — remove after counting
    cs = cs.replace(/::[\w-]+/g, () => { elementCount++; return " "; });

    // Count pseudo-classes (single colon) — must be done AFTER pseudo-elements
    // since single-colon legacy pseudo-elements like :before are also matched here
    cs = cs.replace(/:(?!:)[\w-]+/g, () => { classCount++; return " "; });

    // Remaining words are element type selectors (excluding * and &)
    const words = cs.split(/[\s>+~]+/).filter((w) => w && w !== "*" && w !== "&");
    elementCount += words.length;
  }

  return idCount * 1000000 + classCount * 10000 + elementCount * 100;
}

// Split a selector on combinators (space, >, +, ~), respecting nesting in parens.
// If sep is given, splits on that character instead (for comma splitting).
function splitTopLevel(s: string, sep?: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (depth === 0 && sep && s[i] === sep) {
      parts.push(s.slice(start, i));
      start = i + 1;
    } else if (depth === 0 && !sep && (s[i] === " " || s[i] === ">" || s[i] === "+" || s[i] === "~")) {
      // Only split on combinators that have non-space around them
      // If previous char was also a combinator, skip
      if (i > start) {
        parts.push(s.slice(start, i).trim());
      }
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function collectRules(doc: Document): { rules: MatchedRule[]; inaccessible: boolean } {
  const out: MatchedRule[] = [];
  let inaccessible = false;
  let sourceOrder = 0;
  const walkRules = (rules: CSSRuleList, active = true, layer?: string): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        let cssText: string;
        try {
          cssText = rule.style.cssText ?? "";
        } catch {
          continue;
        }
        out.push({
          selectorText: rule.selectorText,
          specificity: computeSpecificity(rule.selectorText),
          declarations: parseDeclarations(cssText),
          sourceOrder: sourceOrder++,
          active,
          layer,
        });
      } else if ("cssRules" in rule) {
        try {
          const record = rule as unknown as { cssRules: CSSRuleList; conditionText?: string; name?: string };
          let childActive = active;
          const cssText = rule.cssText ?? "";
          if (cssText.startsWith("@media") && record.conditionText) childActive = active && doc.defaultView!.matchMedia(record.conditionText).matches;
          else if (cssText.startsWith("@supports") && record.conditionText) childActive = active && (doc.defaultView?.CSS?.supports(record.conditionText) ?? false);
          else if (cssText.startsWith("@container")) childActive = false; // CSSOM cannot reliably evaluate the queried container.
          const childLayer = cssText.startsWith("@layer") ? record.name ?? cssText.slice(6, cssText.indexOf("{")).trim() : layer;
          walkRules(record.cssRules, childActive, childLayer);
        } catch {
          continue;
        }
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walkRules(sheet.cssRules);
    } catch {
      inaccessible = true;
    }
  }
  return { rules: out, inaccessible };
}

const INHERITED_PROPERTIES = new Set([
  "color", "font", "font-family", "font-size", "font-style", "font-variant", "font-weight",
  "letter-spacing", "line-height", "text-align", "text-indent", "text-transform", "visibility",
  "white-space", "word-spacing", "cursor",
]);

export function getResolvedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules, inaccessible } = collectRules(doc);
  const result = resolvePropertiesFromRules(el, rules, tokenTable);
  const computed = getComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv) {
      prop.resolvedValue = cv;
      const validated = candidateMatchesPainted(el, prop, cv);
      prop.confidence = validated && !inaccessible && !prop.evidence.layer ? "exact" : prop.tokenName ? "probable" : "unknown";
      prop.evidence.inaccessibleStylesheet = inaccessible || undefined;
      prop.evidence.reason = prop.tokenName
        ? (validated ? "authored token declaration validated against computed style" : "authored token candidate could not be proven uniquely")
        : "painted value has no attributable catalog token";
    }
  }

  // Inline declarations participate in the cascade and are explicit evidence,
  // but token attribution is only exact when the authored inline value uses a known token.
  for (const property of Array.from(el.style)) {
    const value = el.style.getPropertyValue(property);
    const declarations = resolveDeclaration({
      property,
      value,
      important: el.style.getPropertyPriority(property) === "important",
    }, tokenTable);
    for (const declaration of declarations) {
      const painted = computed.getPropertyValue(declaration.property);
      const row: ResolvedProperty = {
        property: declaration.property,
        tokenName: declaration.tokenName,
        declaredValue: declaration.declaredValue,
        resolvedValue: painted,
        confidence: "unknown",
        evidence: { selector: "[style]", specificity: 100000000, important: Boolean(declaration.important), inaccessibleStylesheet: inaccessible || undefined, reason: declaration.tokenName ? "inline token declaration validated against computed style" : "inline declaration contains no catalog token" },
      };
      if (declaration.tokenName && candidateMatchesPainted(el, row, painted)) {
        row.confidence = inaccessible ? "probable" : "exact";
        row.evidence.reason = "inline token declaration validated against computed style";
      }
      const index = result.findIndex((item) => item.property === declaration.property);
      if (index >= 0) result[index] = row; else result.push(row);
    }
  }

  // Walk ancestors to find inherited token values — when no rule directly
  // targets the element but a parent/ancestor sets the property via var(--token)
  const seenProperties = new Set(result.map((p) => p.property));
  const rulesSorted = [...rules].sort((a, b) => b.specificity - a.specificity);
  let ancestor: HTMLElement | null = el.parentElement;
  while (ancestor) {
    const ancestorComputed = getComputedStyle(ancestor);
    for (const candidate of resolvePropertiesFromRules(ancestor, rulesSorted, tokenTable)) {
        if (seenProperties.has(candidate.property)) continue;
        if (!INHERITED_PROPERTIES.has(candidate.property) && !candidate.property.startsWith("--")) continue;
        if (!candidate.tokenName) continue;
        const ancestorVal = ancestorComputed.getPropertyValue(candidate.property);
        const elVal = computed.getPropertyValue(candidate.property);
        if (ancestorVal && ancestorVal === elVal) {
          result.push({
            ...candidate,
            resolvedValue: elVal,
            confidence: candidateMatchesPainted(ancestor, candidate, ancestorVal) && !inaccessible && !candidate.evidence.layer ? "exact" : "probable",
            evidence: { ...candidate.evidence, inheritedFrom: ancestor.tagName.toLowerCase(), inaccessibleStylesheet: inaccessible || undefined, reason: "inherited property traced through the ancestor cascade" },
          });
          seenProperties.add(candidate.property);
        }
    }
    ancestor = ancestor.parentElement;
  }

  return result;
}

const INTERACTION_SELECTOR = /:(hover|active|focus-visible|focus|disabled)(?:\b|\()/g;

function selectorForState(selector: string, state: InteractionState): string | null {
  const states = new Set<string>();
  INTERACTION_SELECTOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERACTION_SELECTOR.exec(selector)) !== null) states.add(match[1]!);
  if (state === "base") return states.size === 0 ? selector : null;
  if (!states.has(state)) return states.size === 0 ? selector : null;
  // CSSOM cannot ask the browser whether a hypothetical pseudo-class matches.
  // Removing interaction pseudo-classes gives the authored rule a stable
  // element match for inspection. The real rule remains untouched.
  return selector.replace(INTERACTION_SELECTOR, "");
}

/**
 * Resolve the authored cascade for a chosen interaction state without relying
 * on the pointer's current location. This is intentionally attribution-first:
 * values with no authored declaration still fall back to the browser's live
 * computed value in the field layer.
 */
export function getResolvedPropertiesForState(
  el: HTMLElement,
  tokenTable: TokenTable,
  state: InteractionState,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const stateRules = rules.flatMap((rule) => {
    const selectorText = selectorForState(rule.selectorText, state);
    return selectorText ? [{ ...rule, selectorText }] : [];
  });
  return resolvePropertiesFromRules(el, stateRules, tokenTable);
}

export function getAvailableInteractionStates(el: HTMLElement): InteractionState[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const available: InteractionState[] = ["base"];
  for (const state of INTERACTION_STATES) {
    const relevant = rules.some((rule) => {
      const selector = selectorForState(rule.selectorText, state);
      return selector !== null && rule.selectorText.includes(`:${state}`) && matchingSelectorBranch(el, selector) !== null;
    });
    if (relevant) available.push(state);
  }
  return available;
}

const TRANSIENT_SELECTOR = /:(?:hover|active|focus|focus-visible|focus-within|visited|target)(?:\b|\()/;

/**
 * Finds the authored token-backed declaration beneath a transient interaction
 * state. This keeps an editor linked to its stable token when selection occurs
 * while the element is hovered, while getResolvedProperties remains honest
 * about the value currently painted by that transient rule.
 */
export function getStableTokenProperty(
  el: HTMLElement,
  properties: string[],
  tokenTable: TokenTable,
): ResolvedProperty | null {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const stableRules = rules.filter((rule) => !TRANSIENT_SELECTOR.test(rule.selectorText));
  const rows = resolvePropertiesFromRules(el, stableRules, tokenTable);
  for (const property of properties) {
    const row = rows.find((candidate) => candidate.property === property && candidate.tokenName);
    if (row) return row;
  }
  return null;
}
import { useEffect, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";

export function useResolvedPropertiesDebounced(
  selected: SelectedElement | null,
  state: InteractionState = "base",
): ResolvedProperty[] {
  const [rows, setRows] = useState<ResolvedProperty[]>([]);
  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      setRows(getResolvedPropertiesForState(selected.domElement, getTokenTable(), state));
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [selected, state]);
  return rows;
}
