import { changeKey } from "./model.ts";
import { verifyManagedStyleProjection } from "./managedStyleProjection.ts";
import { isPreviewableChange, type ChangeRecord, type PreviewableChangeRecord } from "./types.ts";
import { publishPreviewDiagnostic, type PreviewAttempt } from "./previewDiagnostics.ts";
import type { PreviewResult } from "../projection/managedStylesheet.ts";

/** The two effects the cycle performs; tests replace them to observe sequencing. */
export interface PreviewVerificationEffects {
  verify(
    change: PreviewableChangeRecord,
    target: HTMLElement | null,
    document: Document,
  ): PreviewResult | null;
  publish(attempt: PreviewAttempt, key: string, result: PreviewResult): void;
}

const defaultEffects: PreviewVerificationEffects = {
  verify: (change, target, document) => verifyManagedStyleProjection(change, target, document),
  publish: (attempt, key, result) => publishPreviewDiagnostic(attempt, key, result),
};

export interface PreviewVerificationRequest {
  /** The full surviving change set: cascade and specificity make earlier results depend on later rules. */
  readonly changes: readonly ChangeRecord[];
  readonly document: Document;
  readonly attempt: PreviewAttempt;
  /** Resolves the element a change was committed against; null verifies against the document alone. */
  readonly targetFor: (change: PreviewableChangeRecord) => HTMLElement | null;
  /** False when a newer revision replaced this attempt. */
  readonly isCurrent?: () => boolean;
  /** Runs a follow-up check after the browser settles an animation; omitted to skip the retry. */
  readonly retryAnimation?: (run: () => void) => void;
}

/** Owns the verify-and-publish cycle shared by the host document and Canvas frames: one preview attempt, every previewable change, one diagnostic per conflict. */
export function verifyPreviewChanges(
  request: PreviewVerificationRequest,
  effects: PreviewVerificationEffects = defaultEffects,
): void {
  for (const change of request.changes) {
    if (!isPreviewableChange(change)) continue;
    const result = effects.verify(change, request.targetFor(change), request.document);
    if (!result) continue;
    effects.publish(request.attempt, changeKey(change), result);
    if (result.status === "conflict" && result.reason === "animation") {
      scheduleSettledRetry(request, change, effects);
    }
  }
}

function scheduleSettledRetry(
  request: PreviewVerificationRequest,
  change: PreviewableChangeRecord,
  effects: PreviewVerificationEffects,
): void {
  request.retryAnimation?.(() => {
    if (request.isCurrent && !request.isCurrent()) return;
    const settled = effects.verify(change, request.targetFor(change), request.document);
    if (settled) effects.publish(request.attempt, changeKey(change), settled);
  });
}
