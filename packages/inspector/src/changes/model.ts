import type { TokenEntry } from "virtual:design-tokens";
import {
  isComponentChange,
  isElementChange,
  isTokenChange,
  type ChangeRecord,
} from "./types.ts";

function tokenReference(token: TokenEntry): string {
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
  if (change.newToken) return tokenReference(change.newToken);
  return change.rawValue ?? "";
}

function isAtBaseline(change: ChangeRecord): boolean {
  if (isTokenChange(change)) return change.rawValue === change.oldRawValue;
  if (isComponentChange(change)) {
    return change.before.kind === "value"
      && Object.is(change.after, change.before.value);
  }
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
    return { ...incoming, before: existing.before };
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

export function mergeChange(
  current: ChangeRecord[],
  incoming: ChangeRecord,
): ChangeRecord[] {
  const key = changeKey(incoming);
  const existing = current.find((candidate) => changeKey(candidate) === key);
  const canonical = mergeWithExisting(incoming, existing);
  const next = current.filter((candidate) => changeKey(candidate) !== key);
  return isAtBaseline(canonical) ? next : [...next, canonical];
}

export function canonicalizeChanges(incoming: ChangeRecord[]): ChangeRecord[] {
  return incoming.reduce(
    (current, change) => mergeChange(current, change),
    [] as ChangeRecord[],
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
  return isComponentChange(change) ? undefined : change.selector;
}
