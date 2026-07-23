import { useState } from "react";
import type { ReactElement } from "react";
import { requestTakeover, getActiveLeaseOwner } from "./workspaceLease.ts";
import { Button } from "../ui/Button.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import lockedWorkspaceStyles from "./LockedWorkspaceNotice.css?inline";

interface LockedWorkspaceNoticeProps {
  onTakeover: () => void;
}

export function LockedWorkspaceNotice({ onTakeover }: LockedWorkspaceNoticeProps): ReactElement {
  const owner = getActiveLeaseOwner();
  const [takingOver, setTakingOver] = useState(false);

  function handleTakeover(): void {
    setTakingOver(true);
    if (requestTakeover()) onTakeover();
    else setTakingOver(false);
  }

  return (
    <>
      <style data-test="locked-workspace-styles">{`${UI_STYLES}\n${lockedWorkspaceStyles}`}</style>
      <aside className="dt-locked-notice" data-test="locked-workspace-notice" aria-live="polite">
        <div className="dt-locked-notice__message">
          Design Tool is open in another tab
        </div>
        <div className="dt-locked-notice__detail">
          Another workspace is active. Design Tool writes are disabled in this tab to protect it from conflicting edits.
          {owner ? ` Active workspace: ${owner.ownerId.slice(0, 8)}...` : ""}
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
