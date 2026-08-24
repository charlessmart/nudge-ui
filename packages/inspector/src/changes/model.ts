import type { TokenEntry } from "virtual:design-tokens";
import {
  isComponentChange,
  isElementChange,
  isTextContentChange,
  isTokenChange,
  type ChangeRecord,
} from "./types.ts";

/**
 * The CSS value a token swap writes into the managed stylesheet and the
 * prompt must describe: an adapter-provided literal when present, otherwise a
 * var() reference on the authored cssName (falling back to the entry name).
 */
export function tokenReference(token: TokenEntry): string {
  return token.cssValue ?? `var(${token.cssName ?? token.name})`;
}

export function changeKey(change: ChangeRecord): string {
  if (isTokenChange(change)) {
    return [
      "token",
      change.tokenName,
      change.file,
      change.line,
      change.selector,
      JSON.stringify(change.context),
    ].join("\u0000");
  }
  if (isComponentChange(change)) {
    return [
      "component-prop",
      change.target.framework,
      change.target.callsiteId,
      change.property,
    ].join("\u0000");
  }
  if (isTextContentChange(change)) {
    // The marker id is document-local projection identity. `beforeText` is
    // part of the durable evidence: two outputs at one source site may have
    // different initial copy and must remain distinct canonical intents.
    return [
      "text-content",
      change.target.sourceSite.cid,
      change.target.sourceSite.src,
      change.target.props ?? "",
      change.target.ariaLabel ?? "",
      change.target.beforeText,
      change.target.textNodePath?.join(",") ?? "",
    ].join("\u0000");
  }
  return [
    change.cid,
    change.file,
    change.line,
    change.scope === "rendered-instance"
      ? change.instanceOverride?.id ?? "missing-instance-override"
      : change.selector,
    change.scope ?? "source-site",
    change.state ?? "base",
    change.property,
  ].join("\u0000");
}

function effectiveValue(change: ChangeRecord): string {
  if (isTokenChange(change)) return change.rawValue;
  if (isComponentChange(change)) return JSON.stringify(change.after);
  if (isTextContentChange(change)) return change.after;
  if (change.newToken) return tokenReference(change.newToken);
  return change.rawValue ?? "";
}

function isAtBaseline(change: ChangeRecord): boolean {
  if (isTokenChange(change)) return change.rawValue === change.oldRawValue;
  if (isComponentChange(change)) {
    return change.before.kind === "value"
      && Object.is(change.after, change.before.value);
  }
  if (isTextContentChange(change)) return change.after === change.before;
  const baseline = change.oldToken
    ? tokenReference(change.oldToken)
    : change.oldRawValue ?? "";
  return effectiveValue(change) === baseline;
}

function mergeWithExisting(
  incoming: ChangeRecord,
  existing: ChangeRecord | undefined,
): ChangeRecord {
  if (existing && isTokenChange(incoming) && isTokenChange(existing)) {
    return { ...incoming, oldRawValue: existing.oldRawValue };
  }
  if (existing && isComponentChange(incoming) && isComponentChange(existing)) {
    return {
      ...incoming,
      before: existing.before,
      scope: incoming.scope ?? existing.scope,
      evidence: incoming.evidence ?? existing.evidence,
    };
  }
  if (existing && isTextContentChange(incoming) && isTextContentChange(existing)) {
    return {
      ...incoming,
      id: existing.id,
      target: existing.target,
      source: existing.source,
      selector: existing.selector,
      before: existing.before,
      authoredAs: existing.authoredAs,
      scope: incoming.scope ?? existing.scope,
      evidence: incoming.evidence ?? existing.evidence,
    };
  }
  if (existing && isElementChange(incoming) && isElementChange(existing)) {
    return {
      ...incoming,
      oldToken: existing.oldToken,
      oldRawValue: existing.oldRawValue,
    };
  }
  return incoming;
}

function textStableIdentity(change: ChangeRecord): string | null {
  if (!isTextContentChange(change)) return null;
  return [
    change.target.sourceSite.cid,
    change.target.sourceSite.src,
    change.target.props ?? "",
    change.target.ariaLabel ?? "",
    change.target.textNodePath?.join(",") ?? "",
  ].join("\u0000");
}

function compatibleTextExisting(
  current: ChangeRecord[],
  incoming: ChangeRecord,
): ChangeRecord | undefined {
  if (!isTextContentChange(incoming)) return undefined;
  const exact = current.filter((candidate) => changeKey(candidate) === changeKey(incoming));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const identity = textStableIdentity(incoming);
  const compatible = current.filter((candidate) =>
    isTextContentChange(candidate)
    && textStableIdentity(candidate) === identity
    && incoming.before === candidate.after);
  return compatible.length === 1 ? compatible[0] : undefined;
}

export function mergeChange(
  current: ChangeRecord[],
  incoming: ChangeRecord,
): ChangeRecord[] {
  const key = changeKey(incoming);
  const existing = isTextContentChange(incoming)
    ? compatibleTextExisting(current, incoming)
    : current.find((candidate) => changeKey(candidate) === key);
  const canonical = mergeWithExisting(incoming, existing);
  const next = existing
    ? current.filter((candidate) => candidate !== existing)
    : isTextContentChange(incoming)
      ? current
      : current.filter((candidate) => changeKey(candidate) !== key);
  return isAtBaseline(canonical) ? next : [...next, canonical];
}

export function canonicalizeChanges(incoming: ChangeRecord[]): ChangeRecord[] {
  return incoming.reduce<ChangeRecord[]>(
    (current, change) => mergeChange(current, change),
    [],
  );
}

export function sameEffectiveChanges(
  left: ChangeRecord[],
  right: ChangeRecord[],
): boolean {
  if (left.length !== right.length) return false;
  const values = new Map(
    left.map((change) => [changeKey(change), effectiveValue(change)]),
  );
  return right.every(
    (change) => values.get(changeKey(change)) === effectiveValue(change),
  );
}

export function selectorForChange(change: ChangeRecord): string | undefined {
  return isComponentChange(change) || isTextContentChange(change) ? undefined : change.selector;
}
