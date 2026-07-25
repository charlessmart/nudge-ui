import type { StyleDeclaration } from "./types.ts";

function stripCssComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function findTopLevelDelimiter(value: string, delimiter: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  let comment = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    const next = value[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === delimiter && parenDepth === 0 && bracketDepth === 0) return index;
  }
  return -1;
}

function splitTopLevelDeclarations(cssText: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  let comment = false;

  for (let index = 0; index < cssText.length; index++) {
    const char = cssText[index]!;
    const next = cssText[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === ";" && parenDepth === 0 && bracketDepth === 0) {
      parts.push(cssText.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(cssText.slice(start));
  return parts;
}

export function parseDeclarations(cssText: string): StyleDeclaration[] {
  const out: StyleDeclaration[] = [];
  for (const part of splitTopLevelDeclarations(cssText)) {
    const index = findTopLevelDelimiter(part, ":");
    if (index === -1) continue;
    const property = stripCssComments(part.slice(0, index)).trim();
    const value = part.slice(index + 1).trim();
    if (!property || !value) continue;
    const important = /!\s*important\s*$/i.test(value);
    out.push({ property, value: value.replace(/!\s*important\s*$/i, "").trim(), important });
  }
  return out;
}

export function selectorKey(selector: string): string {
  return selector.trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,])\s*/g, "$1");
}

function findNextBlockStart(source: string, start: number, end: number): { kind: "block" | "statement" | "end"; index: number } {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  let comment = false;
  for (let index = start; index < end; index++) {
    const char = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (parenDepth === 0 && bracketDepth === 0 && char === "{") return { kind: "block", index };
    else if (parenDepth === 0 && bracketDepth === 0 && char === ";") return { kind: "statement", index };
  }
  return { kind: "end", index: end };
}

function findMatchingBrace(source: string, openIndex: number, end: number): number {
  let depth = 1;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  let comment = false;
  for (let index = openIndex + 1; index < end; index++) {
    const char = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (parenDepth === 0 && bracketDepth === 0 && char === "{") depth++;
    else if (parenDepth === 0 && bracketDepth === 0 && char === "}" && --depth === 0) return index;
  }
  return -1;
}

function isStyleElementInDocument(node: Node | null, doc: Document): node is HTMLStyleElement {
  return node?.ownerDocument === doc && node.nodeType === node.ELEMENT_NODE
    && (node as Element).tagName === "STYLE";
}

/**
 * Recovers authored declarations from an in-document stylesheet. CSSOM may
 * canonicalise values, so this scanner deliberately retains source text while
 * handling grouping rules, strings, comments, brackets, and functions.
 */
export function rawDeclarationsBySelector(sheet: CSSStyleSheet, doc: Document): Map<string, StyleDeclaration[][]> {
  const owner = sheet.ownerNode;
  if (!isStyleElementInDocument(owner, doc) || !owner.textContent) return new Map();

  return recoverDeclarationsBySelector(owner.textContent);
}

/** Parses the authored contents of one stylesheet without depending on CSSOM. */
export function recoverDeclarationsBySelector(source: string): Map<string, StyleDeclaration[][]> {
  const declarations = new Map<string, StyleDeclaration[][]>();
  const walk = (start: number, end: number): void => {
    let cursor = start;
    while (cursor < end) {
      const next = findNextBlockStart(source, cursor, end);
      if (next.kind === "end") return;
      if (next.kind === "statement") { cursor = next.index + 1; continue; }

      const close = findMatchingBrace(source, next.index, end);
      if (close < 0) return;
      const prelude = stripCssComments(source.slice(cursor, next.index)).trim();
      const body = source.slice(next.index + 1, close);
      if (prelude.startsWith("@")) {
        walk(next.index + 1, close);
      } else {
        const parsed = parseDeclarations(body);
        if (parsed.length > 0) {
          const key = selectorKey(prelude);
          const entries = declarations.get(key) ?? [];
          entries.push(parsed);
          declarations.set(key, entries);
        }
        if (body.includes("{")) walk(next.index + 1, close);
      }
      cursor = close + 1;
    }
  };

  walk(0, source.length);
  return declarations;
}
