import { useState } from "react";
import type { ReactElement } from "react";
import { requestTakeover } from "./workspaceLease.ts";
import { Button } from "../ui/Button.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import lockedWorkspaceStyles from "./LockedWorkspaceNotice.css?inline";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";

interface LockedWorkspaceNoticeProps {
  onTakeover: () => void | Promise<void>;
  storageError?: boolean;
}

export function LockedWorkspaceNotice({ onTakeover, storageError = false }: LockedWorkspaceNoticeProps): ReactElement {
  const [takingOver, setTakingOver] = useState(false);

  async function handleTakeover(): Promise<void> {
    setTakingOver(true);
    try {
      if (requestTakeover()) await onTakeover();
    } finally {
      setTakingOver(false);
    }
  }

  return (
    <>
      <InspectorStyle testId="locked-workspace-styles" css={`${UI_STYLES}\n${lockedWorkspaceStyles}`} />
      <aside className="locked-notice" data-test="locked-workspace-notice" aria-live="polite">
        <div className="locked-notice__message">
          {storageError ? "Can’t load saved changes. Try again." : "Nudge UI is open in another tab"}
        </div>
        <Button
          data-test="takeover-here"
          disabled={takingOver}
          onClick={handleTakeover}
        >
          {takingOver ? "Taking over..." : "Take Over Here"}
        </Button>
      </aside>
    </>
  );
}
