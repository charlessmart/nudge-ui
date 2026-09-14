import { useState } from "react";
import type { ReactElement } from "react";
import { requestTakeover } from "./workspaceLease.ts";
import { Button } from "../ui/Button.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import lockedWorkspaceStyles from "./LockedWorkspaceNotice.css?inline";

interface LockedWorkspaceNoticeProps {
  onTakeover: () => void;
}

export function LockedWorkspaceNotice({ onTakeover }: LockedWorkspaceNoticeProps): ReactElement {
  const [takingOver, setTakingOver] = useState(false);

  function handleTakeover(): void {
    setTakingOver(true);
    if (requestTakeover()) onTakeover();
    else setTakingOver(false);
  }

  return (
    <>
      <style data-test="locked-workspace-styles">{`${UI_STYLES}\n${lockedWorkspaceStyles}`}</style>
      <aside className="locked-notice" data-test="locked-workspace-notice" aria-live="polite">
        <div className="locked-notice__message">
          Nudge UI is open in another tab
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
