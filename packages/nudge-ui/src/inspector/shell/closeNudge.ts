import { createNudgeUiDirectUrl, readNudgeUiEditorTarget, rememberNudgeUiTabSwitch } from "../../transport/editor.ts";
import { isDemoRuntime } from "../runtime/runtimeConfig.ts";

/** Leaves the editor for the plain app; the floating Nudge button reopens it. */
export function closeNudgeUi(): void {
  const applicationUrl = readNudgeUiEditorTarget(window.location.href);
  if (!applicationUrl) return;
  // The demo never reads tab flags and leaves no storage behind; its plain page is reached by the URL alone.
  if (!isDemoRuntime()) rememberNudgeUiTabSwitch("off");
  window.location.assign(createNudgeUiDirectUrl(applicationUrl));
}
