/** The common names of the nine standard weights; a variable font's in-between weights have none and stay numbers. */
const WEIGHT_NAMES: Readonly<Record<string, string>> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

const KEYWORD_WEIGHTS: Readonly<Record<string, string>> = { normal: "400", bold: "700" };

/** The weights offered from the field's chevron. */
export const FONT_WEIGHT_NAME_SUGGESTIONS = ["Light", "Regular", "Medium", "Semibold", "Bold"] as const;

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

const WEIGHT_BY_NAME = new Map(Object.entries(WEIGHT_NAMES).map(([weight, name]) => [compact(name), weight]));

/** How a weight reads in the field: `600` and `bold` as their names, `450` as itself. */
export function fontWeightName(value: string): string {
  const trimmed = value.trim();
  const weight = KEYWORD_WEIGHTS[trimmed.toLowerCase()] ?? trimmed;
  return WEIGHT_NAMES[weight] ?? trimmed;
}

/** The CSS a typed weight writes: a name, in any case or spacing (`semi-bold`, `ExtraBold`), becomes its number; anything else is left as typed. */
export function fontWeightValue(value: string): string {
  const trimmed = value.trim();
  return WEIGHT_BY_NAME.get(compact(trimmed)) ?? trimmed;
}
