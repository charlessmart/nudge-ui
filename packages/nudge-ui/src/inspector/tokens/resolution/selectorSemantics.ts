function extractParenContent(source: string, openIndex: number) {
  let depth = 0;
  let index = openIndex;
  while (index < source.length && source[index] !== "(") index++;
  if (index >= source.length) return { content: "", end: openIndex };
  depth = 1;
  const start = index + 1;
  index++;
  while (index < source.length && depth > 0) {
    if (source[index] === "(") depth++;
    else if (source[index] === ")") depth--;
    index++;
  }
  return { content: source.slice(start, index - 1).trim(), end: index };
}

export function splitSelectorAtTopLevel(selector: string, separator?: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    if (selector[index] === "(") depth++;
    else if (selector[index] === ")") depth--;
    else if (depth === 0 && separator && selector[index] === separator) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    } else if (depth === 0 && !separator && (selector[index] === " " || selector[index] === ">" || selector[index] === "+" || selector[index] === "~")) {
      if (index > start) parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = selector.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

const SPECIFICITY_MEMO_LIMIT = 10_000;
const specificityMemo = new Map<string, number>();
let specificityComputations = 0;

/** Test-only specificity cache size. */
export function specificityComputationCount(): number {
  return specificityComputations;
}

/** Test-only specificity cache reset. */
export function resetSpecificityMemo(): void {
  specificityMemo.clear();
  specificityComputations = 0;
}

/**
 * Computes the cascade weight for a selector without asking the DOM to match
 * it. Results are memoized per selector string for the resolution paths that
 * still recompute branch specificity (multi-branch selectors).
 */
export function computeSpecificity(selectorText: string): number {
  const cached = specificityMemo.get(selectorText);
  if (cached !== undefined) return cached;
  specificityComputations++;
  const result = computeSpecificityCore(selectorText);
  if (specificityMemo.size >= SPECIFICITY_MEMO_LIMIT) specificityMemo.clear();
  specificityMemo.set(selectorText, result);
  return result;
}

/** Unmemoized implementation used by equivalence tests. */
export function computeSpecificityCore(selectorText: string): number {
  const selector = selectorText.trim();
  const commaParts = splitSelectorAtTopLevel(selector, ",");
  if (commaParts.length > 1) {
    return Math.max(...commaParts.map(computeSpecificity));
  }

  let idCount = 0;
  let classCount = 0;
  let elementCount = 0;
  for (const compound of splitSelectorAtTopLevel(selector)) {
    let current = compound;
    const pseudoFunction = /:(not|is|has|where)\(/g;
    let match: RegExpExecArray | null;
    while ((match = pseudoFunction.exec(current)) !== null) {
      const name = match[1]!;
      const { content, end } = extractParenContent(current, match.index + match[0].length - 1);
      const argumentSpecificity = content ? computeSpecificity(content) : 0;
      if (name !== "where") {
        idCount += Math.floor(argumentSpecificity / 1000000);
        classCount += Math.floor(argumentSpecificity / 10000) % 100;
        elementCount += Math.floor(argumentSpecificity / 100) % 100;
      }
      current = current.slice(0, match.index) + " " + current.slice(end);
      pseudoFunction.lastIndex = match.index + 1;
    }

    current = current.replace(/#[\w-]+/g, () => { idCount++; return " "; });
    current = current.replace(/\.[\w-]+/g, () => { classCount++; return " "; });
    current = current.replace(/\[[^\]]*\]/g, () => { classCount++; return " "; });
    current = current.replace(/::[\w-]+/g, () => { elementCount++; return " "; });
    current = current.replace(/:(?!:)[\w-]+/g, () => { classCount++; return " "; });
    elementCount += current.split(/[\s>+~]+/).filter((word) => word && word !== "*" && word !== "&").length;
  }

  return idCount * 1000000 + classCount * 10000 + elementCount * 100;
}

export interface SelectorPseudoClass {
  name: string;
  start: number;
  end: number;
}

const SELECTOR_PSEUDO_CLASS_CACHE_MAX = 16_384;
const selectorPseudoClassMemo = new Map<string, readonly SelectorPseudoClass[]>();

export function selectorPseudoClasses(selector: string): readonly SelectorPseudoClass[] {
  const cached = selectorPseudoClassMemo.get(selector);
  if (cached) return cached;

  const matches: SelectorPseudoClass[] = [];
  let attributeDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (attributeDepth > 0) {
      if (character === '"' || character === "'") quote = character;
      else if (character === "[") attributeDepth++;
      else if (character === "]") attributeDepth--;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") {
      attributeDepth = 1;
      continue;
    }
    if (character !== ":" || selector[index - 1] === ":" || selector[index + 1] === ":") continue;
    const name = /^[A-Za-z-]+/.exec(selector.slice(index + 1))?.[0];
    if (!name) continue;
    matches.push({ name: name.toLowerCase(), start: index, end: index + name.length + 1 });
    index += name.length;
  }

  if (selectorPseudoClassMemo.size >= SELECTOR_PSEUDO_CLASS_CACHE_MAX) selectorPseudoClassMemo.clear();
  selectorPseudoClassMemo.set(selector, matches);
  return matches;
}

export function hasSelectorPseudoClass(selector: string, names: ReadonlySet<string>): boolean {
  return selectorPseudoClasses(selector).some(({ name }) => names.has(name));
}

const STATIC_SELECTOR_FUNCTIONS = new Set(["is", "where", "not"]);
const STATIC_PSEUDO_CLASSES = new Set(["host", "root"]);
const SELECTOR_SENSITIVITY_CACHE_MAX = 16_384;
const selectorSensitivityMemo = new Map<string, boolean>();

function selectorFunctionEnd(selector: string, openingIndex: number): number {
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = openingIndex; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      brackets++;
      continue;
    }
    if (character === "]") {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (brackets > 0) continue;
    if (character === "(") {
      parentheses++;
    } else if (character === ")") {
      parentheses--;
      if (parentheses === 0) return index;
    }
  }
  return -1;
}

export function isElementSensitiveSelector(selector: string): boolean {
  const cached = selectorSensitivityMemo.get(selector);
  if (cached !== undefined) return cached;
  const result = computeElementSensitiveSelector(selector);
  if (selectorSensitivityMemo.size >= SELECTOR_SENSITIVITY_CACHE_MAX) selectorSensitivityMemo.clear();
  selectorSensitivityMemo.set(selector, result);
  return result;
}

function computeElementSensitiveSelector(selector: string): boolean {
  let attributeDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (attributeDepth > 0) {
      if (character === '"' || character === "'") quote = character;
      else if (character === "[") attributeDepth++;
      else if (character === "]") attributeDepth--;
      continue;
    }
    // Tailwind escapes utility variants such as `.sm\\:text-red-500`. The
    // escaped colon is part of the class name, not a pseudo-class boundary.
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") {
      attributeDepth = 1;
      continue;
    }
    if (character === "+" || character === "~") return true;
    if (character !== ":") continue;
    const pseudoElement = selector[index + 1] === ":";
    const pseudo = /^[A-Za-z-]+/.exec(selector.slice(index + (pseudoElement ? 2 : 1)))?.[0];
    if (pseudoElement) {
      // Pseudo-elements do not change whether the originating element matches
      // a selector. Continue scanning after the name so a real pseudo-class
      // elsewhere in the selector remains element-sensitive.
      if (!pseudo) return true;
      index += pseudo.length + 1;
      let next = index + 1;
      while (next < selector.length && /\s/.test(selector[next]!)) next++;
      if (selector[next] === "(") return true;
      continue;
    }
    if (!pseudo) continue;
    const pseudoName = pseudo.toLowerCase();
    index += pseudo.length;
    let next = index + 1;
    while (next < selector.length && /\s/.test(selector[next]!)) next++;
    if (STATIC_SELECTOR_FUNCTIONS.has(pseudoName) && selector[next] === "(") {
      const end = selectorFunctionEnd(selector, next);
      if (end < 0 || isElementSensitiveSelector(selector.slice(next + 1, end))) return true;
      index = end;
      continue;
    }
    // :root and :host are represented by the complete ancestor/document
    // context. Other pseudo-classes can vary per concrete element without an
    // attribute or sibling mutation (for example :checked, :visited, and
    // :target), so keep them in the element-sensitive bucket.
    if (STATIC_PSEUDO_CLASSES.has(pseudoName)) continue;
    return true;
  }
  return false;
}

function selectorSubject(selector: string): string {
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      brackets++;
      continue;
    }
    if (character === "]") {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (brackets > 0) continue;
    if (character === "(") {
      parentheses++;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (parentheses > 0) continue;
    if (character === ">" || character === "+" || character === "~" || /\s/.test(character)) {
      start = index + 1;
    }
  }
  return selector.slice(start).trim();
}

function cssIdentifierEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const character = source[index]!;
    if (character === "\\") {
      index++;
      if (index >= source.length) break;
      if (/[0-9a-fA-F]/.test(source[index]!)) {
        let digits = 0;
        while (index < source.length && digits < 6 && /[0-9a-fA-F]/.test(source[index]!)) {
          index++;
          digits++;
        }
        if (/\s/.test(source[index] ?? "")) index++;
      } else {
        index++;
      }
      continue;
    }
    if (!/[A-Za-z0-9_-]/.test(character) && character.charCodeAt(0) < 0x80) break;
    index++;
  }
  return index;
}

function unescapeCssIdentifier(value: string): string {
  return value
    .replace(/\\([0-9a-fA-F]{1,6})(?:\s)?/g, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint === 0
        || codePoint > 0x10FFFF
        || (codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ? "\uFFFD"
        : String.fromCodePoint(codePoint);
    })
    .replace(/\\(.)/g, "$1");
}

const SELECTOR_CLASS_REQUIREMENTS_CACHE_MAX = 16_384;
const selectorClassRequirementsMemo = new Map<string, readonly string[]>();

function selectorClassRequirements(selector: string): readonly string[] {
  const cached = selectorClassRequirementsMemo.get(selector);
  if (cached) return cached;

  const subject = selectorSubject(selector);
  const requirements: string[] = [];
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < subject.length; index++) {
    const character = subject[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      brackets++;
      continue;
    }
    if (character === "]") {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (brackets > 0) continue;
    if (character === "(") {
      parentheses++;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (parentheses > 0 || character !== ".") continue;
    const end = cssIdentifierEnd(subject, index + 1);
    const className = unescapeCssIdentifier(subject.slice(index + 1, end));
    if (className) requirements.push(className);
    index = end - 1;
  }
  if (selectorClassRequirementsMemo.size >= SELECTOR_CLASS_REQUIREMENTS_CACHE_MAX) {
    selectorClassRequirementsMemo.clear();
  }
  selectorClassRequirementsMemo.set(selector, requirements);
  return requirements;
}

/**
 * Rejects selectors whose rightmost compound requires a class the element
 * does not have. This is a conservative prefilter: it only returns false for
 * an impossible positive class requirement and leaves all other selectors to
 * the browser's selector engine.
 */
export function canMatchSelectorSubject(el: Element, selector: string): boolean {
  return selectorClassRequirements(selector).every((className) => el.classList.contains(className));
}
