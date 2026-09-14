import type { TokenEntry } from "virtual:design-tokens";
import type { ComponentChangeRecord } from "../componentSemantics/types.ts";
import type {
  EditScope,
  RenderedInstanceOverride,
  StyleRuleContext,
  TextContentChangeRecord,
} from "./editModel.ts";

/** Bounded rendered facts retained for one element without an authored source location. */
export interface RuntimeElementEvidence {
  /**
   * Why the location is unknown; prompts phrase their guidance accordingly.
   * Omitted by legacy records, which are all runtime-created DOM.
   */
  reason?: "runtime-created" | "unannotated";
  tagName: string;
  text: string | null;
  props: string | null;
  ariaLabel: string | null;
}

export interface ElementChangeRecord {
  kind?: "element";
  cid: string;
  file: string;
  line: number;
  /** Exact source column for static HTML; omitted by legacy React records. */
  column?: number;
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
  /** Present when the selected element has a document-local runtime identity. */
  runtimeEvidence?: RuntimeElementEvidence;
  scope?: EditScope;
  /** Durable, controller-owned target for one rendered output. */
  instanceOverride?: RenderedInstanceOverride;
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
  important: boolean;
  context: StyleRuleContext;
  contextLabel: string;
  source: { file: string; line: number; component: string };
  cid?: undefined;
  oldToken?: null;
  newToken?: null;
  scope?: undefined;
}

export type ChangeRecord =
  | ElementChangeRecord
  | TokenChangeRecord
  | ComponentChangeRecord
  | TextContentChangeRecord;

export type PreviewableChangeRecord = ElementChangeRecord | TokenChangeRecord;

export function isTokenChange(change: ChangeRecord): change is TokenChangeRecord {
  return change.kind === "token";
}

export function isComponentChange(change: ChangeRecord): change is ComponentChangeRecord {
  return change.kind === "component-prop";
}

export function isTextContentChange(change: ChangeRecord): change is TextContentChangeRecord {
  return change.kind === "text-content";
}

export function isElementChange(change: ChangeRecord): change is ElementChangeRecord {
  return !isTokenChange(change) && !isComponentChange(change) && !isTextContentChange(change);
}

export function isPreviewableChange(
  change: ChangeRecord,
): change is PreviewableChangeRecord {
  return isElementChange(change) || isTokenChange(change);
}

export type { ComponentChangeRecord } from "../componentSemantics/types.ts";
export type {
  TextBindingEvidence,
  TextContentChangeRecord,
  TextProjectionScope,
  TextProjectionSourceSite,
  TextProjectionTarget,
} from "./editModel.ts";
export {
  isTextContentChangeListValue,
  isTextContentChangeValue,
  isTextProjectionTargetValue,
} from "./editModel.ts";
