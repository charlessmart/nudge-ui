// Parser-free, so the inspector can read `data-cstyle` without bundling the compiler.

/** The identity entry that records how an element's `style` prop is authored (ADR-0053). */
export const STYLE_PROVENANCE_ATTRIBUTE = "data-cstyle";

export type StyleProvenanceKind = "literal" | "expression";

/**
 * Keyed by the CSS property an authored key writes (kebab-case, React Native names mapped to their CSS form).
 * Each entry is `[kind, value source text, authored key]`. `opaque` holds the source of style values whose
 * properties cannot be read: identifiers, calls, spreads and function bodies with statements.
 */
export interface StyleProvenance {
  props: Record<string, [StyleProvenanceKind, string, string]>;
  opaque: string[];
}

/** Parses a `data-cstyle` value; null when it is absent or malformed. */
export function parseStyleProvenance(value: string | null | undefined): StyleProvenance | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { props, opaque } = parsed as Partial<StyleProvenance>;
    if (typeof props !== "object" || props === null || !Array.isArray(opaque)) return null;
    return { props, opaque: opaque.filter((entry): entry is string => typeof entry === "string") };
  } catch {
    return null;
  }
}
