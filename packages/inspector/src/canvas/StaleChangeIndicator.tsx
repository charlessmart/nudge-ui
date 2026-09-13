import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";
import type { ChangeRecord } from "../changes/changesLog.ts";
import { isPreviewableChange, isTokenChange } from "../changes/changesLog.ts";
import { changeKey } from "../changes/model.ts";
import {
  getAnyPreviewDiagnostic,
  getPreviewDiagnosticRevision,
  subscribePreviewDiagnostics,
} from "../changes/previewDiagnostics.ts";
import { humanizeSelector } from "../tokens/catalog.ts";
import { getScopingSelectorPattern } from "../runtime/runtimeConfig.ts";
import { isVerificationPending } from "./staleChangeDetector.ts";

interface Props {
  change: ChangeRecord;
}

export function StaleChangeIndicator({ change }: Props): ReactElement | null {
  useSyncExternalStore(
    subscribePreviewDiagnostics,
    getPreviewDiagnosticRevision,
    getPreviewDiagnosticRevision,
  );
  if (!isPreviewableChange(change)) return null;
  const result = getAnyPreviewDiagnostic(changeKey(change))?.result;
  if (result === undefined) {
    if (isVerificationPending()) {
      return (
        <span className="changes__verifying" data-test="stale-verifying">
          Verifying...
        </span>
      );
    }
    return null;
  }

  if (result.status !== "conflict") return null;

  if (result.reason === "target-missing") {
    // ADR-0011: host scoping markers are opaque structure and must not
    // surface as human-facing guidance; the raw selector stays in change
    // records for managed-rule targeting.
    const selectorLabel = humanizeSelector(change.selector, getScopingSelectorPattern())
      || change.selector;
    return (
      <span
        className="changes__stale"
        data-test="stale-missing"
        title={`Selector: ${selectorLabel}`}
      >
        Source missing — this edit may be stale
      </span>
    );
  }

  if (result.reason === "token-drift") {
    const currentValue = result.computedValue
      ? ` (current: ${result.computedValue})`
      : "";

    if (isTokenChange(change)) {
      return (
        <span
          className="changes__stale"
          data-test="stale-token-drift"
          title={`Token ${change.tokenName} baseline has changed since this edit was made${currentValue}`}
        >
          Token baseline has changed
        </span>
      );
    }

    return null;
  }

  return (
    <span
      className="changes__conflict"
      data-test="preview-conflict"
      title={`Computed: ${result.computedValue}`}
    >
      Preview Blocked (
      {result.reason
        ? result.reason.replace(/-/g, " ")
        : "Unknown"}
      )
    </span>
  );
}
