/** `:is(parent)` keeps nesting's maximum parent-list specificity without expanding every combination. */
export function resolveNestedSelector(selector: string, parent: string): string {
  const subject = `:is(${parent})`;
  const branches: string[] = [];
  let branch = "";
  let hasNesting = false;
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  const finishBranch = (): void => {
    branches.push(hasNesting ? branch.trim() : `${subject} ${branch.trim()}`);
    branch = "";
    hasNesting = false;
  };

  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (character === "\\") {
      branch += character + (selector[++index] ?? "");
      continue;
    }
    if (quote) {
      branch += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "/" && selector[index + 1] === "*") {
      const end = selector.indexOf("*/", index + 2);
      if (end < 0) return "";
      branch += selector.slice(index, end + 2);
      index = end + 1;
      continue;
    } else if (character === "[") {
      brackets++;
    } else if (character === "]") {
      brackets--;
    } else if (brackets === 0) {
      if (character === "(") parentheses++;
      else if (character === ")") parentheses--;
      else if (character === "&") {
        branch += subject;
        hasNesting = true;
        continue;
      } else if (character === "," && parentheses === 0) {
        finishBranch();
        continue;
      }
    }
    branch += character;
  }
  finishBranch();
  return branches.join(", ");
}
