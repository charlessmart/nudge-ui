import { useState } from "react";
import type { ReactElement } from "react";
import { requestTakeover, getActiveLeaseOwner } from "./workspaceLease.ts";
import { Button } from "../ui/Button.tsx";

export function LockedWorkspaceNotice(): ReactElement {
  const owner = getActiveLeaseOwner();
  const [takingOver, setTakingOver] = useState(false);

  function handleTakeover(): void {
    setTakingOver(true);
    requestTakeover();
    window.location.reload();
  }

  return (
    <div className="dt-locked-notice" data-test="locked-workspace-notice">
      <div className="dt-locked-notice__message">
        Design Tool writes are disabled.
      </div>
      <div className="dt-locked-notice__detail">
        Another workspace is active in a different tab.
        {owner ? ` (owner: ${owner.ownerId.slice(0, 8)}...)` : ""}
      </div>
      <Button
        data-test="takeover-here"
        disabled={takingOver}
        onClick={handleTakeover}
      >
        {takingOver ? "Taking over..." : "Take Over Here"}
      </Button>
    </div>
  );
}
