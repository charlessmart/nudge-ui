/**
 * Low-level, browser-safe CSS value splitting helpers shared by the
 * value-semantics Modules (plan slice 3.4). These are internal parsing seams,
 * not public Interface: they split structure, they do not interpret meaning.
 */

/**
 * Balanced `var()` scanning. Handles nested parentheses and takes the first
 * top-level comma as the fallback separator.
 */
export function extractVarCalls(value: string): Array<{ name: string; fallback?: string }> {
  const calls: Array<{ name: string; fallback?: string }> = [];
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf("var(", i);
    if (start < 0) break;
    let depth = 1;
    let j = start + 4;
    let comma = -1;
    while (j < value.length && depth > 0) {
      const char = value[j];
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === "," && depth === 1 && comma < 0) comma = j;
      j++;
    }
    const body = value.slice(start + 4, Math.max(start + 4, j - 1)).trim();
    const name = (body.slice(0, comma < 0 ? body.length : comma - start - 4).trim().match(/^--[\w-]+/) ?? [])[0];
    if (name) {
      const fallback = comma >= 0 ? value.slice(comma + 1, Math.max(comma + 1, j - 1)).trim() : undefined;
      calls.push({ name, fallback });
    }
    i = Math.max(j, start + 4);
  }
  return calls;
}

/** Index of the first top-level `/` in a value, or -1 when none exists. */
export function topLevelSlashIndex(value: string): number {
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "/" && depth === 0) return index;
  }
  return -1;
}

/** Splits CSS values at top-level combinators or an optional delimiter. */
export function splitTopLevel(s: string, sep?: string): string[] {
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
      // Only split on combinators that have non-space around them.
      if (i > start) parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/** Splits a value at top-level whitespace, honoring quotes and nesting. */
export function splitTopLevelWhitespace(value: string): string[] {
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
