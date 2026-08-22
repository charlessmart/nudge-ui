import { useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { IconChevronDown, IconClipboardCheck } from "@tabler/icons-react";
import { useChanges } from "./changesLog.ts";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import { copyToClipboard } from "./prompt/copyToClipboard.ts";
import { Button } from "./ui/Button.tsx";
import { IconButton } from "./ui/IconButton.tsx";
import { getStructuralChanges, subscribeStructuralChanges } from "./structuralProjection.ts";
import { getDesignToolRuntimeConfig } from "./runtimeConfig.ts";

export function CopyPromptButton(): ReactElement {
  const changes = useChanges();
  const structuralChanges = useSyncExternalStore(
    subscribeStructuralChanges,
    getStructuralChanges,
    getStructuralChanges,
  );
  const [copied, setCopied] = useState(false);
  const disabled = changes.length + structuralChanges.length === 0;

  async function onClick(): Promise<void> {
    if (disabled) return;
    const runtimeConfig = getDesignToolRuntimeConfig();
    const hints = {
      framework: runtimeConfig.framework,
      stylingSystem: runtimeConfig.stylingSystem,
      // The host names the framework line ("React on Next.js (App Router)")
      // and must match inspectElement's hint construction.
      host: runtimeConfig.host,
    };
    const text = generatePrompt(changes, hints, structuralChanges);
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="dt-copy-prompt" data-test="copy-prompt-control">
      <Button
        variant="primary"
        className="dt-copy-prompt__main"
        data-test="copy-prompt"
        type="button"
        disabled={disabled}
        data-copied={copied ? "true" : "false"}
        onClick={onClick}
      >
        <IconClipboardCheck size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
        {copied ? "Copied!" : "Copy prompt"}
      </Button>
      <IconButton
        variant="primary"
        className="dt-copy-prompt__menu"
        label="Copy prompt options"
        title="Copy prompt options"
        data-test="copy-prompt-menu"
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
      >
        <IconChevronDown size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
