/** A string-keyed string map used for default style values. */
export type StringRecord = Record<string, string>;

/** A string-keyed map from a longhand property to the shorthands that set it. */
export type StringListRecord = Record<string, readonly string[]>;
