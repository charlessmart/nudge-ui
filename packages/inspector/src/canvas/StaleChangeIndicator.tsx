import type { ReactElement } from "react";
import type { ChangeRecord } from "../changesLog.ts";
import { isPreviewableChange, isTokenChange } from "../changesLog.ts";
import { humanizeSelector } from "../tokens/catalog.ts";
import { getScopingSelectorPattern } from "../runtimeConfig.ts";
import { isVerificationPending } from "./staleChangeDetector.ts";

interface Props {
  change: ChangeRecord;
}

export function StaleChangeIndicator({ change }: Props): ReactElement | null {
  if (!isPreviewableChange(change)) return null;
  if (change.previewResult === undefined) {
    if (isVerificationPending()) {
      return (
        <span className="changes__verifying" data-test="stale-verifying">
          Verifying...
        </span>
      );
    }
    return null;
  }

  if (change.previewResult.status !== "conflict") return null;

  if (change.previewResult.reason === "target-missing") {
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

  if (change.previewResult.reason === "token-drift") {
    const currentValue = change.previewResult.computedValue
      ? ` (current: ${change.previewResult.computedValue})`
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
      title={`Computed: ${change.previewResult.computedValue}`}
    >
      Preview Blocked (
      {change.previewResult.reason
        ? change.previewResult.reason.replace(/-/g, " ")
        : "Unknown"}
      )
    </span>
  );
}
