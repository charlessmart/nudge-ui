import type { ComponentContract, ComponentPropValue } from "./types.ts";

/** Dev-only document attribute naming the variant a component's host node renders, as whitespace-separated tokens. */
export const VARIANT_ATTRIBUTE = "data-nudge-ui-variant";

/** The props a variant edit is limited to; values are the strings and booleans of the contract's select and boolean props. */
export interface VariantScope {
  componentName: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
  props: Record<string, string | boolean>;
}

/** Whitespace, quotes and backslashes would break the token list or the attribute selector, so they are percent-encoded. */
function encodePart(value: string): string {
  return encodeURIComponent(value).replace(/['!()*~]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/** One marker token: `<Component>.<prop>=<value>`. */
export function variantToken(componentName: string, prop: string, value: ComponentPropValue): string {
  return `${encodePart(componentName)}.${encodePart(prop)}=${encodePart(String(value))}`;
}

/** Sorted so equal variants always produce an equal attribute value. */
export function variantTokens(componentName: string, props: Readonly<Record<string, ComponentPropValue>>): string[] {
  return Object.keys(props).sort().map((prop) => variantToken(componentName, prop, props[prop]!));
}

/** The props of a contract a document marker can describe. */
export function variantPropNames(contract: ComponentContract): string[] {
  return contract.props
    .filter((prop) => (prop.control === "select" && prop.options.length > 0) || prop.control === "boolean")
    .map((prop) => prop.name);
}

/** Markers for the props a component rendered with; an omitted prop falls back to the contract's default, and has no token without one. */
export function variantTokensForProps(
  contract: ComponentContract,
  props: Readonly<Record<string, unknown>>,
): string[] {
  const tokens: string[] = [];
  for (const prop of contract.props) {
    const value = props[prop.name] ?? prop.defaultValue;
    if (prop.control === "select" && prop.options.length > 0) {
      if (typeof value === "string" || typeof value === "number") tokens.push(variantToken(contract.name, prop.name, value));
    } else if (prop.control === "boolean" && typeof value === "boolean") {
      tokens.push(variantToken(contract.name, prop.name, value));
    }
  }
  return tokens.sort();
}

export function mergeVariantTokens(existing: string | null, tokens: Iterable<string>): string {
  return [...new Set([...(existing ? existing.split(/\s+/) : []), ...tokens])].filter(Boolean).sort().join(" ");
}

export function variantAttributeValue(tokens: Iterable<string>): string {
  return mergeVariantTokens(null, tokens);
}

/** Compound selector matching a node whose marker holds every token of the scope. */
export function variantTokenSelectors(scope: VariantScope): string {
  return variantTokens(scope.componentName, scope.props)
    .map((token) => `[${VARIANT_ATTRIBUTE}~="${token}"]`)
    .join("");
}

/**
 * Matches the marked node and everything below it: the sheet marks a cell wrapper,
 * an application marks the component's root host node.
 */
export function variantScopeSelector(scope: VariantScope): string {
  const marked = variantTokenSelectors(scope);
  return `:is(${marked}, ${marked} *)`;
}

export function variantScopeKey(scope: VariantScope | undefined): string {
  return scope ? variantTokens(scope.componentName, scope.props).join(" ") : "";
}

/** "Button variant=primary, size=sm" for prompts and labels. */
export function describeVariantScope(scope: VariantScope): string {
  const props = Object.keys(scope.props).sort().map((prop) => `${prop}=${String(scope.props[prop])}`);
  return `${scope.componentName} ${props.join(", ")}`.trim();
}

export function isVariantScopeValue(value: unknown): value is VariantScope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.some((key) => key !== "componentName" && key !== "props")) return false;
  if (typeof candidate.componentName !== "string" || candidate.componentName.length === 0) return false;
  const props = candidate.props;
  if (typeof props !== "object" || props === null || Array.isArray(props)) return false;
  const entries = Object.entries(props);
  return entries.length > 0 && entries.every(([name, prop]) =>
    name.length > 0 && (typeof prop === "string" || typeof prop === "boolean"));
}

/** Reads the props a marker token list describes for one component; the inverse of `variantTokens`. */
export function parseVariantTokens(componentName: string, attribute: string | null): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {};
  const prefix = `${encodePart(componentName)}.`;
  for (const token of attribute?.split(/\s+/) ?? []) {
    if (!token.startsWith(prefix)) continue;
    const separator = token.indexOf("=", prefix.length);
    if (separator < 0) continue;
    try {
      const prop = decodeURIComponent(token.slice(prefix.length, separator));
      const raw = decodeURIComponent(token.slice(separator + 1));
      props[prop] = raw === "true" ? true : raw === "false" ? false : raw;
    } catch {
      // A malformed token is ignored.
    }
  }
  return props;
}

const SOURCE_SITE_PREFIX = /^\[data-cid="(?:[^"\\]|\\.)*"\]\[data-src="((?:[^"\\]|\\.)*)"\](.*)$/s;
const DEFINITION_PREFIX = /^:is\(\[data-src="((?:[^"\\]|\\.)*)"\], \[data-nudge-def="(?:[^"\\]|\\.)*"\]\)(.*)$/s;

/**
 * Narrows a source-site selector to one variant. A component's root carries the callsite's identity in an
 * application and only its own definition marker in the sheet, so both are matched. Already scoped selectors,
 * and selectors that are not source-site selectors, are returned unchanged.
 */
export function scopeSelectorToVariant(selector: string, scope: VariantScope): string {
  if (selector.includes(VARIANT_ATTRIBUTE)) return selector;
  const match = SOURCE_SITE_PREFIX.exec(selector) ?? DEFINITION_PREFIX.exec(selector);
  if (!match) return selector;
  const [, src, rest] = match;
  return `:is([data-src="${src}"], [data-nudge-def="${src}"])${variantScopeSelector(scope)}${rest}`;
}
