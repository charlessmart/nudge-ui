/** CSS-string escaping for selectors assembled from runtime DOM metadata. */
export function escapeCssString(value: string): string {
  // Keep ordinary source selectors readable and byte-compatible. Once a
  // string contains a quote, backslash, or control character, hex-escape the
  // complete value so punctuation cannot terminate the CSS string early.
  if (!/["\\\0-\x1f\x7f]/.test(value)) return value;
  let escaped = "";
  for (const character of value) {
    if (/^[A-Za-z0-9 _-]$/.test(character)) {
      escaped += character;
      continue;
    }
    escaped += `\\${character.codePointAt(0)!.toString(16)} `;
  }
  return escaped;
}

export function escapeAttrValue(value: string): string {
  return escapeCssString(value);
}
