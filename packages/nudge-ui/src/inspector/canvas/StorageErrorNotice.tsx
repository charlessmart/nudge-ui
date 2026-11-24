import { useState } from "react";
import type { ReactElement } from "react";
import { requestTakeover } from "./workspaceLease.ts";
import { Button } from "../ui/Button.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import storageErrorStyles from "./StorageErrorNotice.css?inline";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";

interface StorageErrorNoticeProps {
  onRetry: () => void | Promise<void>;
}

/** Shown when saved changes cannot be read; retrying reclaims ownership before loading again. */
export function StorageErrorNotice({ onRetry }: StorageErrorNoticeProps): ReactElement {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry(): Promise<void> {
    setRetrying(true);
    try {
      if (requestTakeover()) await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <InspectorStyle testId="storage-error-styles" css={`${UI_STYLES}\n${storageErrorStyles}`} />
      <aside className="storage-error-notice" data-test="storage-error-notice" aria-live="polite">
        <div className="storage-error-notice__message">Can’t load saved changes</div>
        <Button
          variant="primary"
          data-test="storage-error-retry"
          disabled={retrying}
          onClick={handleRetry}
        >
          {retrying ? "Loading…" : "Try again"}
        </Button>
      </aside>
    </>
  );
}
