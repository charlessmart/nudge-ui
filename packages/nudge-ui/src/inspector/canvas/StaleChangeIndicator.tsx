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

  if (result.status === "applied") {
    return (
      <span className="changes__diagnostic" data-test="preview-applied" data-status="applied">
        Preview active
      </span>
    );
  }

  if (result.reason === "target-missing") {
    return (
      <span className="changes__stale" data-test="stale-missing">
        Source missing — this edit may be stale
      </span>
    );
  }

  if (result.reason === "token-drift") {
    if (isTokenChange(change)) {
      return (
        <span className="changes__stale" data-test="stale-token-drift">
          Token baseline has changed
        </span>
      );
    }

    return null;
  }

  return (
    <span className="changes__conflict" data-test="preview-conflict">
      Preview Blocked (
      {result.reason
        ? result.reason.replace(/-/g, " ")
        : "Unknown"}
      )
    </span>
  );
}
