function extractParenContent(source: string, openIndex: number): { content: string; end: number } {
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

function splitSelectorAtTopLevel(selector: string, separator?: string): string[] {
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

/** Computes the cascade weight for a selector without asking the DOM to match it. */
export function computeSpecificity(selectorText: string): number {
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
