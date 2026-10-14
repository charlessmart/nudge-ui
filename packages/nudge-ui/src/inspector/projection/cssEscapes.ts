export function escapeCssString(value: string): string {
  // Keep ordinary selectors byte-compatible; a value containing a quote,
  // backslash, or control character is hex-escaped whole to prevent an early string end.
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
