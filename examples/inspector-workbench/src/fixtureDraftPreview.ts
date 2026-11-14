import { getActiveDraftChanges, subscribeActiveDraftChanges } from "@inspector/drafts/store.ts";
import { compileDraftProjection } from "@inspector/projection/draftProjection.ts";
import { notifyBrowserStylesheetChange } from "@inspector/inspection/browserCssInspectionRegistry.ts";
import { isOriginalPreviewActive, subscribeOriginalPreview } from "@inspector/shell/originalPreview.ts";

/**
 * Style-only preview of the fixtures' own draft. The fixtures have no frame to project into, so the workbench
 * writes the draft's CSS itself, into a sheet the outer editor's projection never replaces.
 */
export function installFixtureDraftPreview(): void {
  const sheet = document.createElement("style");
  sheet.dataset.nudgeUi = "workbench-fixture-preview";
  document.head.append(sheet);
  const project = (): void => {
    sheet.textContent = isOriginalPreviewActive() ? "" : compileDraftProjection(getActiveDraftChanges()).managedStyles.css;
    notifyBrowserStylesheetChange(document);
  };
  subscribeActiveDraftChanges(project);
  subscribeOriginalPreview(project);
}
