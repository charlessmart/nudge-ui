import type { TokenEntry } from "virtual:design-tokens";
import { tokenCatalog, tokens } from "virtual:design-tokens";

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

export interface MatchedRule {
  selectorText: string;
  declarations: { property: string; value: string; important?: boolean }[];
  specificity: number;
  sourceOrder?: number;
  layer?: string;
  active?: boolean;
}

const MAX_PROPERTIES = 100;
const VAR_REF = /var\(\s*(--[\w-]+)/g;

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
      const res = resolveTokenValue(decl.value, tokenTable);
      const candidate: ResolvedProperty = {
        property: decl.property,
        tokenName: res.tokenName,
        declaredValue: decl.value.trim(),
        resolvedValue: res.resolvedValue,
        confidence: res.tokenName ? "probable" : "unknown",
        evidence: {
          selector: branch,
          sourceOrder: rule.sourceOrder,
          specificity,
          important: Boolean(decl.important),
          layer: rule.layer,
          reason: res.tokenName ? "authored declaration references a catalog token" : "no catalog token reference",
        },
      };
      const previous = map.get(decl.property);
      if (!previous || compareCandidate(candidate, previous) >= 0) map.set(decl.property, candidate);
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

function parseDeclarations(cssText: string): { property: string; value: string; important?: boolean }[] {
  const out: { property: string; value: string; important?: boolean }[] = [];
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
    const res = resolveTokenValue(value, tokenTable);
    const painted = computed.getPropertyValue(property);
    const row: ResolvedProperty = {
      property, tokenName: res.tokenName, declaredValue: value.trim(), resolvedValue: painted,
      confidence: "unknown",
      evidence: { selector: "[style]", specificity: 100000000, important: el.style.getPropertyPriority(property) === "important", inaccessibleStylesheet: inaccessible || undefined, reason: res.tokenName ? "inline token declaration validated against computed style" : "inline declaration contains no catalog token" },
    };
    if (res.tokenName && candidateMatchesPainted(el, row, painted)) {
      row.confidence = inaccessible ? "probable" : "exact";
      row.evidence.reason = "inline token declaration validated against computed style";
    }
    const index = result.findIndex((item) => item.property === property);
    if (index >= 0) result[index] = row; else result.push(row);
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
import { useEffect, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";

export function useResolvedPropertiesDebounced(
  selected: SelectedElement | null,
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
      setRows(getResolvedProperties(selected.domElement, getTokenTable()));
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [selected]);
  return rows;
}
