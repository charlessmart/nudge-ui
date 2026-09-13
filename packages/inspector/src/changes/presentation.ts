import {
  formatComponentPropBaseline,
  formatComponentPropValue,
} from "../componentSemantics/changeModel.ts";
import {
  isComponentChange,
  isTokenChange,
  isTextContentChange,
  type ChangeRecord,
} from "./types.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import type { EditScope } from "../editScope.ts";

export interface ChangePresentation {
  groupKey: string;
  groupLabel: string;
  file: string;
  property: string;
  propertyLabel: string;
  before: string;
  after: string;
  scope?: EditScope;
  evidence?: string;
}

export function presentChange(change: ChangeRecord): ChangePresentation {
  if (isTokenChange(change)) {
    return {
      groupKey: [
        "token",
        change.tokenName,
        change.file,
        change.line,
        change.contextLabel,
      ].join("\u0000"),
      groupLabel: `Global token · ${change.tokenName}`,
      file: change.file,
      property: change.property,
      propertyLabel: change.contextLabel,
      before: change.oldRawValue,
      after: change.rawValue,
    };
  }
  if (isComponentChange(change)) {
    return {
      groupKey: [
        "component-prop",
        change.target.framework,
        change.target.callsiteId,
      ].join("\u0000"),
      groupLabel: `${change.target.componentName} · Component`,
      file: change.target.file,
      property: change.property,
      propertyLabel: formatInspectorLabel(change.property),
      before: formatComponentPropBaseline(change.before),
      after: formatComponentPropValue(change.after),
      scope: change.scope ?? "source-site",
      evidence: change.evidence
        ? `occurrence ${change.evidence.occurrence + 1} · ${change.evidence.mountedCount} mounted outputs`
        : undefined,
    };
  }
  if (isTextContentChange(change)) {
    return {
      groupKey: [
        "text-content",
        change.target.sourceSite.cid,
        change.target.sourceSite.src,
        change.target.occurrence,
        change.target.props ?? "",
        change.target.ariaLabel ?? "",
      ].join("\u0000"),
      groupLabel: `${change.source.component || change.target.sourceSite.cid} · Rendered text`,
      file: change.source.file,
      property: "text-content",
      propertyLabel: "Rendered text",
      before: change.before,
      after: change.after,
      scope: change.scope ?? "rendered-instance",
      evidence: change.evidence
        ? `${change.evidence.componentName}.${change.evidence.property} · ${change.evidence.mountedCount} mounted outputs`
        : undefined,
    };
  }
  return {
    groupKey: [
      change.cid,
      change.file,
      change.line,
      change.selector,
      change.scope ?? "source-site",
    ].join("\u0000"),
    groupLabel: change.cid,
    file: change.file,
    property: change.property,
    propertyLabel: formatInspectorLabel(change.property),
    before: change.oldToken?.name
      ?? (change.rawValue !== undefined && change.newToken
        ? change.rawValue
        : "(original)"),
    after: change.newToken?.name ?? change.rawValue ?? "",
  };
}
