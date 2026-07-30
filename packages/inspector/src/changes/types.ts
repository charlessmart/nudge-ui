import type { TokenEntry } from "virtual:design-tokens";
import type { PreviewResult, StyleRuleContext } from "../managedStylesheet.ts";
import type { ComponentChangeRecord } from "../componentSemantics/types.ts";

export interface ElementChangeRecord {
  kind?: "element";
  cid: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  /** CSSOM-declared source context that the inspector projection came from. */
  sourceProperty?: string;
  /** Best-effort CSSOM serialization; not an exact source-text quote. */
  sourceAuthoredValue?: string;
  oldToken: TokenEntry | null;
  newToken: TokenEntry | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
  scope?: "source-site" | "instance-preview";
  instanceEvidence?: { renderedIndex: number; props: string | null; text: string | null };
  previewResult?: PreviewResult;
  state?: "base" | "hover" | "active" | "focus" | "focus-visible" | "disabled";
}

export interface TokenChangeRecord {
  kind: "token";
  tokenName: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  rawValue: string;
  oldRawValue: string;
  context: StyleRuleContext;
  contextLabel: string;
  source: { file: string; line: number; component: string };
  cid?: undefined;
  oldToken?: null;
  newToken?: null;
  scope?: undefined;
  instanceEvidence?: undefined;
  previewResult?: PreviewResult;
}

export type ChangeRecord =
  | ElementChangeRecord
  | TokenChangeRecord
  | ComponentChangeRecord;

export type PreviewableChangeRecord = ElementChangeRecord | TokenChangeRecord;

export function isTokenChange(change: ChangeRecord): change is TokenChangeRecord {
  return change.kind === "token";
}

export function isComponentChange(change: ChangeRecord): change is ComponentChangeRecord {
  return change.kind === "component-prop";
}

export function isElementChange(change: ChangeRecord): change is ElementChangeRecord {
  return !isTokenChange(change) && !isComponentChange(change);
}

export function isPreviewableChange(
  change: ChangeRecord,
): change is PreviewableChangeRecord {
  return !isComponentChange(change);
}

export type { ComponentChangeRecord } from "../componentSemantics/types.ts";
