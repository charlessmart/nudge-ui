import type { StyleDeclaration } from "../tokens/editActions.ts";

export type StyleReader = (property: string) => string;

/** How lines break: not at all, as the browser does by default, or rebalanced by `text-wrap-style`. */
export type TextWrap = "nowrap" | "wrap" | "pretty" | "balance";

export interface TextWrapChoice {
  value: TextWrap;
  label: string;
  description: string;
}

export const TEXT_WRAP_CHOICES: readonly TextWrapChoice[] = [
  { value: "nowrap", label: "None", description: "No wrapping" },
  { value: "wrap", label: "Normal", description: "Default wrapping" },
  { value: "pretty", label: "Pretty", description: "Avoids orphans" },
  { value: "balance", label: "Balance", description: "Spreads text evenly" },
];

/** Whether lines never wrap: `text-wrap-mode: nowrap`, or `white-space: nowrap` where the browser has no `text-wrap-mode`. */
export function keepsOneLine(read: StyleReader): boolean {
  const mode = read("text-wrap-mode");
  return mode ? mode === "nowrap" : read("white-space") === "nowrap";
}

/** Reads the `text-wrap` longhands; text kept on one line, by `text-wrap` or `white-space`, reads as None. */
export function readTextWrap(read: StyleReader): TextWrap {
  if (keepsOneLine(read)) return "nowrap";
  const style = read("text-wrap-style");
  return style === "pretty" || style === "balance" ? style : "wrap";
}

/** `text-wrap` sets both the mode and the style, so one declaration moves between any two choices. */
export function textWrapDeclarations(next: TextWrap): StyleDeclaration[] {
  return [{ property: "text-wrap", value: next }];
}
