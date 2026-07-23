import { useState } from "react";
import type { ReactElement } from "react";
import { useChanges } from "./changesLog.ts";
import { tokens } from "virtual:design-tokens";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import { detectFramework } from "./prompt/detectFramework.ts";
import { copyToClipboard } from "./prompt/copyToClipboard.ts";
import { Button } from "./ui/Button.tsx";

export function CopyPromptButton(): ReactElement {
  const changes = useChanges();
  const [copied, setCopied] = useState(false);
  const disabled = changes.length === 0;

  async function onClick(): Promise<void> {
    if (disabled) return;
    const hints = detectFramework(tokens);
    const text = generatePrompt(changes, hints);
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant={disabled ? "disabled" : "primary"}
      className="dt-panel__copy"
      data-test="copy-prompt"
      disabled={disabled}
      data-copied={copied ? "true" : "false"}
      onClick={onClick}
    >
      {copied ? "Copied!" : disabled ? "No changes" : "Copy prompt"}
    </Button>
  );
}
