import { createRoot } from "react-dom/client";
import { openNudgeUi } from "../../transport/editor.ts";
import { adoptStylesheet, allowsStyleElements } from "../runtime/ownedStylesheets.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import { NudgeLogoIcon } from "./NudgeLogoIcon.tsx";

const CLOSED_ROOT_ID = "nudge-ui-closed-root";

/** The plain page keeps one Nudge button, in the same style as the collapsed panel. */
export function mountClosedNudge(): void {
  if (document.getElementById(CLOSED_ROOT_ID)) return;
  const host = document.createElement("div");
  host.id = CLOSED_ROOT_ID;
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  if (allowsStyleElements(document)) {
    const style = document.createElement("style");
    style.textContent = UI_STYLES;
    shadow.append(style);
  } else {
    adoptStylesheet(shadow, UI_STYLES, UI_STYLES);
  }
  createRoot(shadow).render(
    <div className="panel__restore">
      <IconButton
        variant="quiet"
        label="Open Nudge"
        title="Open Nudge"
        className="panel__restore-button"
        data-test="open-nudge"
        onClick={() => openNudgeUi({ rememberTab: true })}
      >
        <NudgeLogoIcon />
      </IconButton>
    </div>,
  );
}
