import type { DraftPreview } from "@inspector/changes/draftPreview.ts";
import type { DraftChangesSnapshot } from "@inspector/drafts/draftStore.ts";
import { compileDraftProjection } from "@inspector/projection/draftProjection.ts";
import { notifyBrowserStylesheetChange } from "@inspector/inspection/browserCssInspectionRegistry.ts";
import { isOriginalPreviewActive, subscribeOriginalPreview } from "@inspector/shell/originalPreview.ts";

/** Style-only fixture preview. Never replaces the outer editor's projection sheet. */
export function createDraftPreview(readActive: () => DraftChangesSnapshot): DraftPreview {
  let sheet: HTMLStyleElement | null = null;
  function project(snapshot: DraftChangesSnapshot): void {
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.dataset.nudgeUi = "workbench-fixture-preview";
      document.head.append(sheet);
    }
    sheet.textContent = isOriginalPreviewActive() ? "" : compileDraftProjection(snapshot).managedStyles.css;
    notifyBrowserStylesheetChange(document);
  }
  const unsubscribe = subscribeOriginalPreview(() => project(readActive()));
  return {
    project,
    dispose() {
      unsubscribe();
      sheet?.remove();
    },
  };
}
