import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";

export interface ResolvedProperty {
  property: string;
  tokenName: string | null;
  declaredValue: string;
  resolvedValue: string;
}

export interface TokenTable {
  [varName: string]: TokenEntry;
}

export interface MatchedRule {
  selectorText: string;
  declarations: { property: string; value: string }[];
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
  for (const rule of rules) {
    let matched: boolean;
    try {
      matched = el.matches(rule.selectorText);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    for (const decl of rule.declarations) {
      const res = resolveTokenValue(decl.value, tokenTable);
      map.set(decl.property, {
        property: decl.property,
        tokenName: res.tokenName,
        declaredValue: decl.value.trim(),
        resolvedValue: res.resolvedValue,
      });
    }
  }
  return Array.from(map.values()).slice(0, MAX_PROPERTIES);
}

function parseDeclarations(cssText: string): { property: string; value: string }[] {
  const out: { property: string; value: string }[] = [];
  for (const part of cssText.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const property = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!property || !value) continue;
    out.push({ property, value });
  }
  return out;
}

function collectRules(doc: Document): MatchedRule[] {
  const out: MatchedRule[] = [];
  const walkRules = (rules: CSSRuleList): void => {
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
          declarations: parseDeclarations(cssText),
        });
      } else if ("cssRules" in rule) {
        try {
          walkRules((rule as { cssRules: CSSRuleList }).cssRules);
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
      continue;
    }
  }
  return out;
}

export function getResolvedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const rules = collectRules(doc);
  const result = resolvePropertiesFromRules(el, rules, tokenTable);
  const computed = getComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv) prop.resolvedValue = cv;
  }

  // Walk ancestors to find inherited token values — when no rule directly
  // targets the element but a parent/ancestor sets the property via var(--token)
  const seenProperties = new Set(result.map((p) => p.property));
  let ancestor: HTMLElement | null = el.parentElement;
  while (ancestor) {
    const ancestorComputed = getComputedStyle(ancestor);
    for (const rule of rules) {
      let matched: boolean;
      try {
        matched = ancestor.matches(rule.selectorText);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      for (const decl of rule.declarations) {
        if (seenProperties.has(decl.property)) continue;
        const res = resolveTokenValue(decl.value, tokenTable);
        if (!res.tokenName) continue;
        const ancestorVal = ancestorComputed.getPropertyValue(decl.property);
        const elVal = computed.getPropertyValue(decl.property);
        if (ancestorVal && ancestorVal === elVal) {
          result.push({
            property: decl.property,
            tokenName: res.tokenName,
            declaredValue: decl.value.trim(),
            resolvedValue: elVal,
          });
          seenProperties.add(decl.property);
        }
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
